import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import * as M from '../lib/menu.js';
import { COMBOS, GROUPS } from '../lib/drinks.js';
import { buildPages } from '../scripts/build-pages.js';

const files = buildPages();
const pages = Object.entries(files).filter(([p]) => p.endsWith('.html'));

test('committed pages match the generator (run `npm run pages` if this fails)', () => {
  for (const [rel, text] of Object.entries(files)) {
    assert.ok(existsSync(rel), `${rel} is missing`);
    assert.equal(readFileSync(rel, 'utf8'), text, `${rel} is out of date`);
  }
  const onDisk = readdirSync('drinks', { recursive: true }).filter(f => f.endsWith('.html')).map(f => `drinks/${f}`);
  assert.deepEqual(onDisk.sort(), pages.map(([p]) => p).sort(), 'stale pages left in drinks/');
});

test('every combo is valid, orderable and has a unique slug', () => {
  const slugs = new Set();
  for (const c of COMBOS) {
    assert.ok(/^[a-z0-9-]+$/.test(c.slug), c.slug);
    assert.ok(!slugs.has(c.slug), `duplicate ${c.slug}`);
    assert.ok(!GROUPS.some(g => g.slug === c.slug), `${c.slug} collides with a collection`);
    slugs.add(c.slug);
    for (const f of c.combo.flavors) assert.ok(M.FLAVORS.some(x => x.name === f), `${c.slug}: unknown flavor ${f}`);
    const fixed = M.fixCombo(c.combo);
    assert.deepEqual(fixed.extras, c.combo.extras, `${c.slug}: an extra isn't allowed on this drink`);
    assert.equal(fixed.temp, c.combo.temp, `${c.slug}: temperature not allowed`);
    assert.ok(c.combo.flavors.length >= 1 && c.combo.flavors.length <= 3, `${c.slug}: 1 to 3 flavors`);
    assert.ok(c.blurb.length > 40 && c.blurb.length < 240, `${c.slug}: blurb length`);
    assert.deepEqual(M.comboFromQuery(M.comboToQuery(fixed)), fixed, `${c.slug}: tweak link round trip`);
  }
});

test('each drink page says the exact order line and links back to the builder', () => {
  for (const c of COMBOS) {
    const html = files[`drinks/${c.slug}/index.html`];
    const line = M.orderLine(M.fixCombo(c.combo)).replace(/'/g, '&#39;');
    assert.ok(html.includes(`<p class="line">${line}</p>`), c.slug);
    assert.ok(html.includes(`href="/?${M.comboToQuery(M.fixCombo(c.combo)).replace(/&/g, '&amp;')}#build"`), `${c.slug} tweak link`);
  }
});

test('titles and descriptions are unique and a sensible length', () => {
  const titles = new Set(), descs = new Set();
  for (const [rel, html] of pages) {
    const t = html.match(/<title>([^<]+)<\/title>/)[1];
    const d = html.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.ok(!titles.has(t), `duplicate title ${t}`); titles.add(t);
    assert.ok(!descs.has(d), `duplicate description on ${rel}`); descs.add(d);
    assert.ok(d.length <= 170, `${rel} description is ${d.length} chars`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${rel} needs exactly one h1`);
  }
});

test('internal links all point at real pages', () => {
  const known = new Set(['/', '/drinks', ...Object.keys(files).filter(p => p.startsWith('drinks/')).map(p => '/' + p.replace(/\/index\.html$/, ''))]);
  for (const [rel, html] of pages) {
    for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
      if (href.startsWith('/assets/')) { assert.ok(existsSync(href.slice(1)), `${rel} -> ${href}`); continue }
      assert.ok(known.has(href), `${rel} links to missing ${href}`);
    }
  }
});

test('sitemap lists the home page and every generated page', () => {
  const xml = files['sitemap.xml'];
  assert.ok(xml.includes('<loc>https://brewcombos.com/</loc>'));
  for (const [rel] of pages) {
    const path = '/' + rel.replace(/\/index\.html$/, '');
    assert.ok(xml.includes(`<loc>https://brewcombos.com${path}</loc>`), path);
  }
});
