import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import handler from '../api/community.js';
import { communityConfig, validateCombo, savedRecord } from '../lib/community-server.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
const user = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'person@example.com', email_confirmed_at: '2026-09-25T12:00:00Z' };
const combo = { drink: 'energy', temp: 'iced', size: 'medium', milk: '', flavors: ['Strawberry', 'Peach'], extras: ['lightice'], sf: false, sweet: 'regular' };
let requestNumber = 0;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
});

function configure(routes = () => []) {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const data = url.endsWith('/auth/v1/user') ? user : await routes(url, options);
    if (data instanceof Response) return data;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

async function call(url, { method = 'GET', body, token = 'valid-user-token', headers = {} } = {}) {
  let output;
  const result = { status: 200, headers: {} };
  const req = { url, method, body, headers: { 'x-forwarded-for': `test-${++requestNumber}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers } };
  const res = {
    setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
    status(code) { result.status = code; return this; },
    json(value) { output = value; return this; },
  };
  await handler(req, res);
  return { ...result, body: output };
}

test('community is gracefully unavailable without credentials', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  const result = await call('/api/community?action=config');
  assert.equal(result.status, 503);
  assert.equal(result.body.configured, false);
  assert.match(result.body.error, /device saves still work/);
});

test('public config exposes only public credentials and refuses service-role keys', async () => {
  const calls = configure();
  const result = await call('/api/community?action=config');
  assert.equal(result.status, 200);
  assert.equal(result.body.supabaseAnonKey, 'sb_publishable_test');
  assert.equal(calls.length, 0);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(communityConfig({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_sensitive' }), null);
  const key = `a.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.b`;
  assert.equal(communityConfig({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: key }), null);
});

test('public community reads approved drinks only and never requests private columns', async () => {
  const calls = configure(() => [{ id: 'published' }]);
  const result = await call('/api/community', { token: null });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.drinks, [{ id: 'published' }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /status=eq.approved/);
  assert.doesNotMatch(calls[0].url, /user_id|reviewed_by/);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('saved drinks and personal submissions require verified authentication', async () => {
  const calls = configure();
  assert.equal((await call('/api/community?action=saved', { token: null })).status, 401);
  assert.equal((await call('/api/community?action=community&scope=mine', { token: null })).status, 401);
  assert.equal(calls.length, 0);
  globalThis.fetch = async () => new Response(JSON.stringify({ ...user, email_confirmed_at: null }));
  assert.equal((await call('/api/community?action=saved')).status, 401);
});

test('save ownership and identity come from the verified user and canonical combo', async () => {
  const calls = configure((url, options) => [{ ...JSON.parse(options.body), created_at: '2026-09-25' }]);
  const result = await call('/api/community?action=saved', { method: 'POST', body: { user_id: 'attacker', id: 'forged', name: 'Peach day', combo, status: 'tried', rating: 4 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.drink.user_id, user.id);
  assert.match(result.body.drink.id, /f=Peach%2CStrawberry/);
  assert.equal(result.body.drink.rating, 4);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer valid-user-token');
  assert.equal(calls[1].options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
  const reversed = savedRecord({ name: 'Other name', combo: { ...combo, flavors: [...combo.flavors].reverse() } }, user.id);
  assert.equal(result.body.drink.id, reversed.id);
});

test('server rejects invalid drinks, ratings, oversized bodies, and non-JSON writes', async () => {
  configure();
  assert.throws(() => validateCombo({ ...combo, drink: '__proto__' }), /valid drink/);
  assert.throws(() => validateCombo({ ...combo, temp: 'hot' }), /valid drink/);
  assert.throws(() => validateCombo({ ...combo, extras: ['shot'] }), /does not fit/);
  assert.throws(() => validateCombo({ ...combo, flavors: ['<script>'] }), /flavor names/);
  assert.throws(() => validateCombo({ ...combo, sf: 'false' }), /on or off/);
  assert.equal((await call('/api/community?action=saved', { method: 'POST', body: { name: 'Drink', combo, rating: 6 } })).status, 400);
  assert.equal((await call('/api/community?action=saved', { method: 'POST', body: { payload: 'x'.repeat(9000) } })).status, 413);
  assert.equal((await call('/api/community?action=saved', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call('/api/community?action=saved', { method: 'POST', body: '{bad json' })).status, 400);
});

test('submission cannot choose owner, approval status, or review metadata', async () => {
  const calls = configure((url, options) => [{ ...JSON.parse(options.body), id: 'new-id' }]);
  const result = await call('/api/community?action=submit', { method: 'POST', body: {
    name: 'Peach day', description: 'Peach and strawberry with light ice.', author_name: 'Pat', combo,
    status: 'approved', user_id: 'other-person', reviewed_by: 'forged', reviewed_at: 'today',
  } });
  assert.equal(result.status, 201);
  const stored = JSON.parse(calls[1].options.body);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.user_id, user.id);
  assert.equal(stored.reviewed_by, undefined);
  assert.equal(stored.reviewed_at, undefined);
});

test('owner query is scoped to the verified user', async () => {
  const calls = configure();
  const result = await call('/api/community?action=community&scope=mine&user_id=attacker');
  assert.equal(result.status, 200);
  assert.match(calls[1].url, new RegExp(`user_id=eq.${user.id}`));
  assert.doesNotMatch(calls[1].url, /attacker/);
});

test('moderation requires trusted admin membership, even for a signed-in user', async () => {
  const calls = configure(() => []);
  const result = await call('/api/community?action=moderate', { method: 'POST', body: { id: user.id, status: 'approved', role: 'admin' } });
  assert.equal(result.status, 403);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /community_admins/);
  assert.equal((await call('/api/community?action=community&scope=moderation')).status, 403);
});

test('admin approval changes only pending status and does not accept content changes', async () => {
  const calls = configure((url, options) => url.includes('/community_admins?') ? [{ user_id: user.id }] : [{ id: user.id, status: JSON.parse(options.body).status }]);
  const result = await call('/api/community?action=moderate', { method: 'POST', body: { id: user.id, status: 'approved', name: 'Replacement' } });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(calls[2].options.body), { status: 'approved' });
  assert.match(calls[2].url, /status=eq.pending/);
});

test('review races return a conflict instead of claiming a changed status', async () => {
  configure(url => url.includes('/community_admins?') ? [{ user_id: user.id }] : []);
  assert.equal((await call('/api/community?action=moderate', { method: 'POST', body: { id: user.id, status: 'rejected' } })).status, 409);
});

test('delete is scoped to owner and safely encodes a full drink query', async () => {
  const calls = configure(() => null);
  const id = savedRecord({ combo, name: 'Peach day' }, user.id).id;
  const result = await call(`/api/community?action=saved&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  assert.equal(result.status, 200);
  assert.equal(calls[1].options.method, 'DELETE');
  const query = new URL(calls[1].url).searchParams;
  assert.equal(query.get('user_id'), `eq.${user.id}`);
  assert.equal(query.get('id'), `eq.${id}`);
});

test('database limits become safe user-facing errors', async () => {
  configure(() => new Response(JSON.stringify({ message: 'saved_drink_limit' }), { status: 400 }));
  const result = await call('/api/community?action=saved', { method: 'POST', body: { combo, name: 'Peach day' } });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /500 saved drinks/);
});

test('provider details and unexpected exceptions are not disclosed', async () => {
  configure(() => new Response(JSON.stringify({ message: 'password=secret; private SQL details' }), { status: 500 }));
  const result = await call('/api/community', { token: null });
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /secret|SQL/);
});

function browserClient(respond, stored = {}) {
  const storage = new Map(Object.entries(stored));
  const calls = [];
  const replaced = [];
  const context = {
    URL, URLSearchParams, AbortSignal, TextEncoder, crypto: webcrypto, btoa,
    setTimeout: () => 1, clearTimeout: () => {}, navigator: {},
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { href: 'https://brewcombos.com/', origin: 'https://brewcombos.com', pathname: '/', hash: '', search: '' },
    history: { state: null, replaceState: (...args) => replaced.push(args[2]) },
    document: { addEventListener() {} }, window: { addEventListener() {} },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const data = await respond(url, options);
      if (data instanceof Response) return data;
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const source = readFileSync(new URL('../assets/account.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  runInNewContext(`${source}\nglobalThis.client = {initAccount,getAccount,sendSignInLink,listCommunity,listSaved,signOut};`, context);
  return { client: context.client, context, storage, calls, replaced };
}

const publicConfig = { configured: true, supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'sb_publishable_test' };

test('browser sends PKCE email links to its own origin without a password', async () => {
  const browser = browserClient(url => url.includes('action=config') ? publicConfig : {});
  await browser.client.sendSignInLink('person@example.com');
  const request = browser.calls[1];
  assert.equal(new URL(request.url).searchParams.get('redirect_to'), 'https://brewcombos.com/#account');
  const body = JSON.parse(request.options.body);
  assert.equal(body.email, 'person@example.com');
  assert.equal(body.code_challenge_method, 's256');
  assert.equal(body.code_challenge.length, 43);
  assert.equal(body.password, undefined);
  assert.ok(browser.storage.get('bc_account_verifier_v1'));
  assert.equal(request.options.headers.Authorization, undefined);
});

test('browser redeems email links and removes the auth code from the address', async () => {
  const browser = browserClient(url => {
    if (url.includes('action=config')) return publicConfig;
    if (url.includes('grant_type=pkce')) return { access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 };
    if (url.includes('action=session')) return { user, isAdmin: false };
    return { drinks: [] };
  }, { bc_account_verifier_v1: JSON.stringify({ verifier: 'browser-verifier', expiresAt: Date.now() + 60000 }) });
  browser.context.location.href = 'https://brewcombos.com/?code=single-use-code#account';
  await browser.client.initAccount();
  assert.equal(browser.client.getAccount().user.id, user.id);
  assert.equal(browser.replaced[0], '/#account');
  assert.equal(JSON.parse(browser.calls[1].options.body).code_verifier, 'browser-verifier');
  assert.equal(browser.calls[2].options.headers.Authorization, 'Bearer access-secret');
  assert.equal(browser.storage.has('bc_account_verifier_v1'), false);
  assert.doesNotMatch(JSON.stringify(browser.client.getAccount()), /access-secret|refresh-secret/);
  await browser.client.listCommunity();
  assert.equal(browser.calls[3].options.headers.Authorization, undefined);
  await browser.client.listSaved();
  assert.equal(browser.calls[4].options.headers.Authorization, 'Bearer access-secret');
});

test('email callback in another browser gives a useful error without accepting URL tokens', async () => {
  const browser = browserClient(() => publicConfig);
  browser.context.location.href = 'https://brewcombos.com/?code=single-use-code#account';
  await browser.client.initAccount();
  assert.equal(browser.client.getAccount().user, null);
  assert.match(browser.client.getAccount().error, /same browser/);
  assert.equal(browser.calls.length, 1);
});

test('expired browser sessions refresh before authenticated API calls and sign-out clears tokens', async () => {
  const browser = browserClient(url => {
    if (url.includes('action=config')) return publicConfig;
    if (url.includes('grant_type=refresh_token')) return { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 };
    if (url.includes('action=session')) return { user, isAdmin: true };
    return {};
  }, { bc_account_session_v1: JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh', expires_at: 1 }) });
  await browser.client.initAccount();
  assert.equal(JSON.parse(browser.calls[1].options.body).refresh_token, 'old-refresh');
  assert.equal(browser.calls[2].options.headers.Authorization, 'Bearer new-access');
  assert.equal(browser.client.getAccount().isAdmin, true);
  await browser.client.signOut();
  assert.equal(browser.client.getAccount().user, null);
  assert.equal(browser.client.getAccount().isAdmin, false);
  assert.equal(browser.storage.has('bc_account_session_v1'), false);
  assert.match(browser.calls[3].url, /logout\?scope=local/);
});

test('email callback can be removed before analytics and redeemed from temporary history state',async()=>{
  const browser=browserClient(url=>url.includes('action=config')?publicConfig:url.includes('grant_type=pkce')?{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}:url.includes('action=session')?{user,isAdmin:false}:{} ,{bc_account_verifier_v1:JSON.stringify({verifier:'private-verifier',expiresAt:Date.now()+60000})});
  browser.context.history.state={bcAuthCallback:{code:'single-use-auth-code',error:false}};
  browser.context.location.href='https://brewcombos.com/#account';
  await browser.client.initAccount();
  assert.equal(browser.client.getAccount().user.id,user.id);
  assert.equal(JSON.parse(browser.calls[1].options.body).auth_code,'single-use-auth-code');
  assert.equal(browser.replaced[0],'/#account');
});
