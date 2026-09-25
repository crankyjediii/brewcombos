import { test } from 'node:test';
import assert from 'node:assert/strict';
import share from '../api/share.js';
import card from '../api/card.js';
import { comboTitle, cleanName } from '../lib/card.js';
import * as M from '../lib/menu.js';

function call(handler, url) {
  return new Promise(resolve => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v },
      end(body) { resolve({ code: this.statusCode, headers, body }) },
    };
    handler({ url, method: 'GET', headers: {} }, res);
  });
}

const Q = 'drink=energy&temp=frozen&size=medium&f=Strawberry,Peach&x=softtop&n=Sunset%20Sprint';

test('share page: order line, preview tags, noindex, links back', async () => {
  const r = await call(share, `/s?${Q}`);
  assert.equal(r.code, 200);
  assert.match(r.body, /<h1>Sunset Sprint<\/h1>/);
  assert.match(r.body, /Can I get a medium 7 Energy chiller with strawberry and peach, plus soft top\?/);
  assert.match(r.body, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(r.body, /rel="canonical"/);
  assert.match(r.body, /og:image" content="https:\/\/brewcombos\.com\/card\.png\?drink=energy&amp;temp=frozen/);
  assert.match(r.body, /href="\/\?drink=energy&amp;temp=frozen&amp;size=medium&amp;f=Strawberry%2CPeach&amp;x=softtop#build">Tweak it/);
});

test('share page: names are cleaned, bad drinks go home', async () => {
  const r = await call(share, '/s?drink=energy&f=Mango&n=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  assert.doesNotMatch(r.body, /<img src=x/);
  const bad = await call(share, '/s?drink=soup');
  assert.equal(bad.code, 302);
  assert.equal(bad.headers.location, '/');
});

test('card: PNG, cached for a year, falls back to the default image', async () => {
  const r = await call(card, `/card.png?${Q}`);
  assert.equal(r.code, 200);
  assert.equal(r.headers['content-type'], 'image/png');
  assert.match(r.headers['cache-control'], /s-maxage=31536000/);
  assert.deepEqual([...r.body.subarray(1, 4)].map(b => String.fromCharCode(b)).join(''), 'PNG');
  const bad = await call(card, '/card.png?drink=soup');
  assert.equal(bad.code, 302);
  assert.equal(bad.headers.location, '/assets/og.png');
});

test('titles for unnamed drinks fit on the card', () => {
  const t = o => comboTitle(M.fixCombo({ drink: 'breve', temp: 'iced', size: 'medium', flavors: [], extras: [], ...o }));
  assert.equal(t({ drink: 'energy', flavors: ['Strawberry', 'Peach'] }), 'Strawberry Peach 7 Energy');
  assert.equal(t({ drink: 'energy', temp: 'frozen', flavors: ['Mango'] }), 'Mango 7 Energy Chiller');
  assert.equal(t({ drink: 'mocha', flavors: ['Toasted Marshmallow', 'Hazelnut', 'Caramel'] }), 'Toasted Marshmallow Mocha');
  assert.equal(t({}), 'Medium iced Breve');
  assert.equal(cleanName('  Sunset   Sprint!  '), 'Sunset Sprint!');
  assert.equal(cleanName('x'.repeat(80)).length, 40);
});

test('the share page does not load the image libraries', async () => {
  const { readFileSync } = await import('node:fs');
  assert.doesNotMatch(readFileSync('api/share.js', 'utf8'), /from '[^']*(card\.js|satori|resvg)/);
});
