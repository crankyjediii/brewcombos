import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/mix.js';

const realFetch = globalThis.fetch;
let calls, replies, ip = 0;

beforeEach(() => {
  calls = [];
  replies = [];
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'main/model';
  process.env.OPENROUTER_FALLBACK_MODELS = 'backup/one, backup/two';
  process.env.RATE_LIMIT_PER_MIN = '3';
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const next = replies.shift() || { status: 500, json: { error: { message: 'no reply queued' } } };
    return new Response(typeof next.json === 'string' ? next.json : JSON.stringify(next.json), { status: next.status || 200 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const drinks = JSON.stringify({ combos: [
  { name: 'Rainy Day', drink: 'latte', temp: 'hot', size: 'medium', milk: 'oat', flavors: ['Vanilla', 'Cinnamon'], extras: [], why: 'Warm.' },
  { name: 'Bright', drink: 'energy', temp: 'iced', size: 'large', milk: '', flavors: ['Mango'], extras: ['lightice'], why: 'Zing.' },
] });
const ok = content => ({ json: { choices: [{ message: { content } }] } });

function call(body, { method = 'POST', addr } = {}) {
  return new Promise(resolve => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); },
    };
    handler({ method, headers: { 'x-forwarded-for': addr || `10.0.0.${++ip}, 1.1.1.1` }, body }, res);
  });
}

test('rejects non-POST', async () => {
  const r = await call({}, { method: 'GET' });
  assert.equal(r.code, 405);
  assert.equal(r.headers.Allow, 'POST');
});

test('500 when settings are missing, without calling out', async () => {
  delete process.env.OPENROUTER_API_KEY;
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 500);
  assert.equal(calls.length, 0);
});

test('400 on an empty vibe', async () => {
  for (const body of [{}, { vibe: '   ' }, null, 'not json']) {
    const r = await call(body);
    assert.equal(r.code, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

test('happy path: one call, reasoning off, JSON mode, drinks normalized', async () => {
  replies.push(ok(drinks));
  const r = await call(JSON.stringify({ vibe: '  rainy\n\nday ', kind: 'coffee', sf: true, custom: ['Honey'] }));
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.combos.map(c => c.drink), ['latte']);   // the energy drink breaks the coffee filter
  assert.equal(r.body.combos[0].sf, true);
  assert.equal(calls.length, 1);
  const { body, headers } = calls[0];
  assert.equal(body.model, 'main/model');
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(headers.Authorization, 'Bearer test-key');
  assert.equal(body.messages.length, 1);
  const prompt = body.messages[0].content;
  assert.match(prompt, /Vibe: rainy day\n/);
  assert.match(prompt, /must be coffee drinks/);
  assert.match(prompt, /sugar-free friendly/);
  assert.match(prompt, /Honey/);
});

test('vibe is capped at 280 characters and unknown kinds fall back to any', async () => {
  replies.push(ok(drinks));
  await call({ vibe: 'a'.repeat(1000), kind: 'soup' });
  const prompt = calls[0].body.messages[0].content;
  assert.match(prompt, new RegExp(`Vibe: a{280}\\n`));
  assert.match(prompt, /Any drink type/);
});

test('falls back to the next model on a provider error inside a 200', async () => {
  replies.push({ status: 200, json: { error: { code: 502, message: 'upstream died' } } }, ok(drinks));
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 200);
  assert.deepEqual(calls.map(c => c.body.model), ['main/model', 'backup/one']);
});

test('falls back when the model reply has no usable drinks', async () => {
  replies.push(ok('{}'), ok('I love coffee!'), ok(drinks));
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 200);
  assert.deepEqual(calls.map(c => c.body.model), ['main/model', 'backup/one', 'backup/two']);
});

test('retries a 429 once on the same model before moving on', async () => {
  replies.push({ status: 429, json: { error: { code: 429, message: 'slow down' } } }, ok(drinks));
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 200);
  assert.deepEqual(calls.map(c => c.body.model), ['main/model', 'main/model']);
});

test('reports 429 when every model is rate limited', async () => {
  process.env.OPENROUTER_FALLBACK_MODELS = '';
  replies.push({ status: 429, json: { error: { code: 429 } } }, { status: 429, json: { error: { code: 429 } } });
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 429);
  assert.match(r.body.error, /minute/);
});

test('reports 502 with a friendly message when everything fails', async () => {
  replies.push({ status: 500, json: 'not json at all' }, { status: 400, json: { error: { message: 'bad' } } }, ok('nothing'));
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 502);
  assert.equal(typeof r.body.error, 'string');
  assert.ok(!/undefined|stack|Error:/.test(r.body.error));
});

test('reads the answer from reasoning when content is empty', async () => {
  replies.push({ json: { choices: [{ message: { content: '', reasoning: drinks } }] } });
  const r = await call({ vibe: 'x' });
  assert.equal(r.code, 200);
});

test('per-visitor rate limit', async () => {
  const addr = '9.9.9.9';
  for (let i = 0; i < 3; i++) { replies.push(ok(drinks)); assert.equal((await call({ vibe: 'x' }, { addr })).code, 200); }
  const r = await call({ vibe: 'x' }, { addr });
  assert.equal(r.code, 429);
  assert.equal(calls.length, 3);
});

test('moves to the next model when every drink breaks the drink-type filter', async () => {
  replies.push(ok(drinks), ok(drinks));
  const r = await call({ vibe: 'x', kind: 'coffee' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.combos.map(c => c.drink), ['latte']);
  assert.equal(calls.length, 1);
  replies.length = 0;
  replies.push(ok(drinks), ok(drinks.replace(/latte/, 'fizz').replace('Vanilla', 'Cherry').replace(', \"Cinnamon\"', '')));
  const r2 = await call({ vibe: 'x', kind: 'nocaf' });
  assert.equal(r2.code, 200);
  assert.deepEqual(r2.body.combos.map(c => c.drink), ['fizz']);
  assert.equal(calls.length, 3);
});
