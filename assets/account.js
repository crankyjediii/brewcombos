// Email links use PKCE: only the browser that requested a link can redeem it.
// Auth tokens stay out of shared URLs and are never sent to analytics or logged.
const SESSION_KEY = 'bc_account_session_v1';
const VERIFIER_KEY = 'bc_account_verifier_v1';
const listeners = new Set();
let account = { configured: false, loading: true, user: null, isAdmin: false, error: '' };
let config, initialization, refreshing, dialog, refreshTimer;
let session = read(SESSION_KEY);

function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function emit() {
  for (const listener of listeners) { try { listener(getAccount()); } catch { /* One consumer must not break sign-in. */ } }
  if (dialog?.open) renderAccount();
}
export const getAccount = () => ({ ...account, user: account.user ? { ...account.user } : null });
export function onAccount(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function storeSession(data) {
  session = data?.access_token && data?.refresh_token ? {
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  } : null;
  try { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* Current tab still works without persistent storage. */ }
  clearTimeout(refreshTimer);
  if (session) refreshTimer = setTimeout(() => refreshSession().catch(() => {}), Math.max(1000, (session.expires_at * 1000) - Date.now() - 60_000));
}

async function jsonRequest(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000), credentials: 'omit' }); }
  catch { throw new Error('Could not connect. Check your connection and try again.'); }
  let data = null;
  try { data = await response.json(); } catch { /* Empty logout response. */ }
  if (!response.ok) {
    const error = new Error(url.startsWith('/api/') ? (data?.error || 'That request could not be completed.')
      : response.status === 429 ? 'Too many sign-in attempts. Wait a minute and try again.'
      : response.status >= 500 ? 'Email sign-in is unavailable right now. Try again shortly.'
      : 'That sign-in link is invalid or expired. Request a fresh link.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function authRequest(path, body, token) {
  return jsonRequest(`${config.supabaseUrl}/auth/v1${path}`, {
    method: 'POST', headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function refreshSession() {
  if (!session || !config) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    // Coordinate refresh-token rotation between tabs when Web Locks is available.
    const refresh = async () => {
      if (!session) return null;
      const stored = read(SESSION_KEY);
      if (stored && stored.refresh_token !== session.refresh_token && stored.expires_at * 1000 > Date.now() + 30_000) { storeSession(stored); return session; }
      const previousToken = session.refresh_token;
      try {
        const data = await authRequest('/token?grant_type=refresh_token', { refresh_token: previousToken });
        if (session?.refresh_token === previousToken) storeSession(data);
        return session;
      } catch (error) {
        if ([400, 401, 403].includes(error.status)) {
          storeSession(null);
          account = { ...account, user: null, isAdmin: false, error: 'Your session expired. Sign in again.' };
          emit();
        } else if (session) {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => refreshSession().catch(() => {}), 60_000);
        }
        throw error;
      }
    };
    return navigator.locks?.request ? navigator.locks.request('bc-account-refresh', refresh) : refresh();
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function currentToken() {
  if (session && session.expires_at * 1000 < Date.now() + 30_000) await refreshSession();
  if (!session) throw new Error('Sign in to continue.');
  return session.access_token;
}

async function api(action, { method = 'GET', body, query = {}, authenticated = true } = {}) {
  await initAccount();
  if (!account.configured) throw new Error(account.error || 'Accounts and community are not connected yet.');
  const token = authenticated ? await currentToken() : null;
  try {
    return await jsonRequest(`/api/community?${new URLSearchParams({ action, ...query })}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.status === 401 && authenticated) {
      storeSession(null);
      account = { ...account, user: null, isAdmin: false, error: 'Your session expired. Sign in again.' };
      emit();
    }
    throw error;
  }
}

async function loadUser() {
  if (!session) { account = { ...account, user: null, isAdmin: false }; return; }
  const token = await currentToken();
  const data = await jsonRequest('/api/community?action=session', { headers: { Authorization: `Bearer ${token}` } });
  account = { ...account, user: data.user, isAdmin: data.isAdmin === true, error: '' };
  // Resume the refresh timer when loading a session persisted by a previous visit.
  storeSession(session);
}

async function redeemLink() {
  const url = new URL(location.href);
  const callback = history.state?.bcAuthCallback;
  const code = callback?.code || url.searchParams.get('code');
  const hash = new URLSearchParams(url.hash.slice(1));
  const failed = callback?.error || url.searchParams.has('error') || hash.has('error');
  if (!code && !failed) return;
  for (const key of ['code', 'error', 'error_code', 'error_description', 'sb_flow_id']) url.searchParams.delete(key);
  url.hash = 'account';
  const {bcAuthCallback, ...restState} = history.state || {};
  history.replaceState(restState, '', url.pathname + url.search + url.hash);
  if (failed) throw new Error('That sign-in link is invalid or expired. Request a fresh link.');
  const stored = read(VERIFIER_KEY);
  if (!stored?.verifier || stored.expiresAt < Date.now()) throw new Error('Open your sign-in link in the same browser that requested it, or request a fresh link here.');
  const data = await authRequest('/token?grant_type=pkce', { auth_code: code, code_verifier: stored.verifier });
  storeSession(data);
  try { localStorage.removeItem(VERIFIER_KEY); } catch { /* Nothing else to do. */ }
}

export function initAccount() {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      config = await jsonRequest('/api/community?action=config');
      account.configured = config.configured === true;
      await redeemLink();
      await loadUser();
    } catch (error) {
      account.error = error.message;
      if ([400, 401, 403].includes(error.status)) storeSession(null);
    } finally {
      account.loading = false;
      emit();
    }
    return getAccount();
  })();
  return initialization;
}

export async function sendSignInLink(email) {
  await initAccount();
  if (!account.configured) throw new Error(account.error || 'Email sign-in is not connected yet.');
  email = String(email || '').trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (!crypto.subtle) throw new Error('Use a secure connection to sign in.');
  let stored = read(VERIFIER_KEY);
  if (!stored?.verifier || stored.expiresAt < Date.now()) {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    stored = { verifier: [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''), expiresAt: Date.now() + 3_600_000 };
  }
  try { localStorage.setItem(VERIFIER_KEY, JSON.stringify(stored)); }
  catch { throw new Error('Allow storage in this browser to receive a sign-in link.'); }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stored.verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const redirect = `${location.origin}/#account`;
  try {
    await authRequest(`/otp?redirect_to=${encodeURIComponent(redirect)}`, { email, create_user: true, code_challenge: challenge, code_challenge_method: 's256' });
  } catch (error) {
    if ([400, 401, 403, 422].includes(error.status)) error.message = 'Could not send a sign-in email. Check the address and try again.';
    throw error;
  }
}

export async function signOut() {
  const token = session?.access_token;
  let failure;
  try { if (token && config) await authRequest('/logout?scope=local', undefined, token); }
  catch (error) { failure = error; }
  finally {
    storeSession(null);
    account = { ...account, user: null, isAdmin: false, error: '' };
    emit();
  }
  if (failure && ![401, 403].includes(failure.status)) throw new Error('Signed out on this browser. The server could not confirm session revocation.');
}

export const listSaved = async () => (await api('saved')).drinks;
export const saveDrink = async drink => (await api('saved', { method: 'POST', body: drink })).drink;
export const deleteSaved = async id => api('saved', { method: 'DELETE', query: { id } });
export const listCommunity = async ({ mine = false, moderation = false } = {}) => (await api('community', {
  authenticated: mine || moderation, query: moderation ? { scope: 'moderation' } : mine ? { scope: 'mine' } : {},
})).drinks;
export const submitDrink = async drink => (await api('submit', { method: 'POST', body: drink })).drink;
export const moderateDrink = async (id, status) => (await api('moderate', { method: 'POST', body: { id, status } })).drink;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'sheet account-sheet';
  dialog.setAttribute('aria-labelledby', 'account-heading');
  dialog.innerHTML = `<form method="dialog" class="sheet-head"><h2 id="account-heading">Your account</h2><button class="icon-btn" aria-label="Close account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></form><div class="account-body" data-account-body></div>`;
  dialog.addEventListener('pointerdown', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

function renderAccount() {
  const body = dialog.querySelector('[data-account-body]');
  if (account.loading) { body.innerHTML = '<p role="status">Opening your account…</p>'; return; }
  if (!account.configured) {
    body.innerHTML = '<p>Email sign-in is not available yet.</p><p class="setting-note">You can still save drinks on this device. Account sync and community submissions will open when the service is connected.</p>';
    return;
  }
  if (account.user) {
    body.innerHTML = '<p class="label">Signed in as</p><p data-account-email></p><p class="setting-note">Your saved drinks and submissions are connected to this email.</p><div class="actions"><a class="btn primary" href="/#saved">My drinks</a><a class="btn quiet" href="/#community">Community</a><button type="button" class="btn quiet" data-sign-out>Sign out</button></div><p class="setting-note" role="status" data-account-note></p>';
    body.querySelector('[data-account-email]').textContent = account.user.email;
    body.querySelectorAll('a').forEach(link => link.addEventListener('click', () => dialog.close()));
    body.querySelector('[data-sign-out]').addEventListener('click', async event => {
      event.target.disabled = true;
      try { await signOut(); } catch (error) { body.querySelector('[data-account-note]').textContent = error.message; }
    });
    return;
  }
  body.innerHTML = `<p>Keep your drink list with you.</p><p class="setting-note">Sign in to sync saved drinks and send your own combos for community review.</p><form data-email-form><label for="account-email">Email address</label><input id="account-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required><button type="submit" class="btn primary">Email me a sign-in link</button></form><p class="setting-note" role="status" data-account-note></p><p class="setting-note">No password. Open the email link in this browser.</p>`;
  const note = body.querySelector('[data-account-note]');
  note.textContent = account.error;
  body.querySelector('[data-email-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    note.textContent = 'Sending your link…';
    try {
      await sendSignInLink(new FormData(event.target).get('email'));
      note.textContent = 'Check your email. Open the sign-in link in this browser to finish.';
    } catch (error) { note.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

export async function openAccount() {
  if (!dialog) buildDialog();
  renderAccount();
  if (!dialog.open) dialog.showModal();
  await initAccount();
  renderAccount();
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-account]')) { event.preventDefault(); openAccount(); }
});
window.addEventListener('storage', async event => {
  if (event.key !== SESSION_KEY) return;
  session = read(SESSION_KEY);
  clearTimeout(refreshTimer);
  if (!config) return;
  try { await loadUser(); } catch (error) { account = { ...account, user: null, isAdmin: false, error: error.message }; }
  emit();
});
window.addEventListener('hashchange', () => { if (location.hash === '#account') openAccount(); });
if (location.hash === '#account' || new URLSearchParams(location.search).has('code')) openAccount();
