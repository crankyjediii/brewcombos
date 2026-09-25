// Generates the drink pages, collection pages and sitemap from lib/drinks.js.
//   npm run pages        write the files
// The output is committed, so Vercel serves plain HTML with no build step.
// test/pages.test.js fails if the committed files are out of date.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/menu.js';
import { SITE, esc, page, cup, mini, swatches, copyBtn, shareBtn, resetCups } from '../lib/layout.js';
import { COMBOS, GROUPS } from '../lib/drinks.js';

const UPDATED = '2026-09-24';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const drinks = COMBOS.map(c => ({ ...c, combo: M.fixCombo(c.combo) }));
const D = c => M.DRINK[c.combo.drink];
const inGroup = (g, c) => g.fits(c.combo, D(c));
const PRIMARY = GROUPS.filter(g => ['energy', 'coffee', 'tea-chai-matcha', 'no-caffeine'].includes(g.slug));
const primaryOf = c => PRIMARY.find(g => inGroup(g, c));
const sfOk = c => GROUPS.find(g => g.sugarFree).fits(c.combo, D(c));
const caffeine = c => D(c).cat !== 'nocaf';
export const cardURL = (o, name) => `${SITE}/card.png?${M.comboToQuery(o)}${name ? `&n=${encodeURIComponent(name)}` : ''}`;

const sayLine = o => sfLine(o, false);
function sfLine(o, sf) { return M.orderLine(M.fixCombo({ ...o, sf })) }

function comboList(list, { sugarFree = false } = {}) {
  return `<ol class="combo-list">${list.map(c => `
    <li><a href="/drinks/${c.slug}">
      ${mini(c.combo)}
      <span class="nm"><b>${esc(c.name)}</b><span>${esc(M.baseLabel(c.combo))}${caffeine(c) ? '' : ' · no caffeine'}</span></span>
      <span class="ln">${esc(sfLine(c.combo, sugarFree))}</span>
    </a></li>`).join('')}
  </ol>`;
}

function groupNav(current) {
  return `<nav class="group-nav" aria-label="Browse by type">${GROUPS.map(g =>
    `<a href="/drinks/${g.slug}"${g.slug === current ? ' aria-current="page"' : ''}>${esc(g.short)}</a>`).join('')}</nav>`;
}

/* ---------- Drink page ---------- */

function drinkPage(c, i) {
  const o = c.combo, d = D(c), line = sayLine(o);
  const group = primaryOf(c);
  const seasonal = o.flavors.some(f => (M.FLAVORS.find(x => x.name === f) || {}).family === 'seasonal');

  const facts = [
    ['Base', `${d.name} · ${d.desc.toLowerCase()}`],
    ['Size', M.baseLabel(o).split(' ')[0]],
    ['Temperature', M.TEMP_LABELS[o.temp]],
  ];
  if (d.milk === 'fixed') facts.push(['Milk', 'Half & half']);
  else if (o.milk && o.milk !== 'none') facts.push(['Milk', (M.MILKS[d.milk].find(m => m[0] === o.milk) || [, o.milk])[1]]);
  facts.push(['Flavors', swatches(o.flavors)]);
  if (o.extras.length) facts.push(['Extras', o.extras.map(x => M.EXTRA[x].label).join(', ')]);
  if (o.sweet !== 'regular') facts.push(['Sweetness', M.SWEETS.find(w => w[0] === o.sweet)[2]]);
  facts.push(['Caffeine', caffeine(c) ? 'Yes' : 'None']);

  const variations = [];
  if (sfOk(c)) variations.push(['Sugar-free', sfLine(o, true)]);
  for (const t of d.temps.filter(t => t !== o.temp)) variations.push([M.TEMP_LABELS[t], M.orderLine(M.fixCombo({ ...o, temp: t }))]);
  if (o.size !== 'large') variations.push(['Large', M.orderLine(M.fixCombo({ ...o, size: 'large' }))]);

  const same = drinks.filter(x => x !== c && primaryOf(x) === group);
  const start = same.length ? i % same.length : 0;
  const related = [...same.slice(start), ...same.slice(0, start)].slice(0, 4);

  const body = `
  <main class="drink-page">
    <article class="drink-hero">
      ${cup(o)}
      <div>
        <p class="label">${esc(group.short)}${seasonal ? ' · seasonal' : ''}</p>
        <h1>${esc(c.name)}</h1>
        <p class="lede">${esc(c.blurb)}</p>
        <div class="say">
          <p class="label">Say this at the window</p>
          <p class="line">${esc(line)}</p>
          <div class="actions">
            ${copyBtn(line)}
            <a class="btn quiet" href="${esc(`/?${M.comboToQuery(o)}#build`)}">Tweak it</a>
            ${shareBtn(`/drinks/${c.slug}`, c.name, line, cardURL(o, c.name))}
          </div>
        </div>
        ${seasonal ? '<p class="note">Seasonal flavor: not every stand carries it year-round. If yours is out, ask what\'s close.</p>' : ''}
      </div>
    </article>

    <div class="drink-more">
      <section aria-labelledby="in-h">
        <h2 id="in-h">What's in it</h2>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${k === 'Flavors' ? v : esc(v)}</dd></div>`).join('')}</dl>
      </section>
      <section aria-labelledby="var-h">
        <h2 id="var-h">Other ways to order it</h2>
        <ul class="variations">${variations.map(([k, v]) => `
          <li><p class="label">${esc(k)}</p><p>${esc(v)}</p>${copyBtn(v, 'Copy')}</li>`).join('')}
        </ul>
      </section>
    </div>

    <section class="related" aria-labelledby="rel-h">
      <div class="section-head"><h2 id="rel-h">More ${esc(group.short.toLowerCase())} combos</h2><a href="/drinks/${group.slug}">See all</a></div>
      ${comboList(related)}
    </section>

    <aside class="nudge">
      <p><strong>Not quite your mood?</strong> Describe it in a few words and get three drinks made for it.</p>
      <a class="btn primary" href="/">Mix from a vibe</a>
    </aside>
  </main>`;

  const desc = `${c.blurb} Order it by saying: "${line}"`;
  return page({
    path: `/drinks/${c.slug}`,
    title: `${c.name}: how to order it at 7 Brew`,
    description: desc.length > 160 ? desc.slice(0, 157).replace(/\s+\S*$/, '') + '…' : desc,
    crumbs: [['Brew Combos', '/'], ['All drinks', '/drinks'], [group.short, `/drinks/${group.slug}`], [c.name, `/drinks/${c.slug}`]],
    image: cardURL(o, c.name),
    body,
  });
}

/* ---------- Collection pages ---------- */

function groupPage(g) {
  const list = drinks.filter(c => inGroup(g, c));
  return page({
    path: `/drinks/${g.slug}`,
    title: `${g.title} and how to order them | Brew Combos`,
    description: `${list.length} ${g.title.replace(/^7 Brew /, '')}, each with the exact words to say at the window. ${g.intro.split('. ')[0]}.`,
    crumbs: [['Brew Combos', '/'], ['All drinks', '/drinks'], [g.short, `/drinks/${g.slug}`]],
    body: `
  <main class="collection">
    <h1>${esc(g.title)}</h1>
    <p class="lede">${esc(g.intro)}</p>
    ${groupNav(g.slug)}
    ${comboList(list, { sugarFree: g.sugarFree })}
  </main>`,
  });
}

function allPage() {
  return page({
    path: '/drinks',
    title: `7 Brew drink combos: ${drinks.length} drinks and how to order them | Brew Combos`,
    description: `${drinks.length} 7 Brew secret menu style combos: energy drinks, coffee, chai, matcha, lemonades, smoothies and shakes, each with the exact sentence to say at the window.`,
    crumbs: [['Brew Combos', '/'], ['All drinks', '/drinks']],
    body: `
  <main class="collection">
    <h1>7 Brew drink combos</h1>
    <p class="lede">${drinks.length} combos you can order at any 7 Brew stand, each with the exact sentence to say at the window. Tap one for sugar-free and Chiller versions.</p>
    ${groupNav('')}
    ${PRIMARY.map(g => `
    <section aria-labelledby="g-${g.slug}">
      <div class="section-head"><h2 id="g-${g.slug}">${esc(g.short)}</h2><a href="/drinks/${g.slug}">Open list</a></div>
      ${comboList(drinks.filter(c => inGroup(g, c)))}
    </section>`).join('')}
  </main>`,
  });
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(p => `  <url>
    <loc>${SITE}${p}</loc>
    <lastmod>${UPDATED}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
}

/* Every generated file, as { 'relative/path': contents }. */
export function buildPages() {
  resetCups();
  const files = {};
  const paths = ['/', '/drinks'];
  files['drinks/index.html'] = allPage();
  for (const g of GROUPS) { files[`drinks/${g.slug}/index.html`] = groupPage(g); paths.push(`/drinks/${g.slug}`) }
  drinks.forEach((c, i) => { files[`drinks/${c.slug}/index.html`] = drinkPage(c, i); paths.push(`/drinks/${c.slug}`) });
  files['sitemap.xml'] = sitemap(paths);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = buildPages();
  rmSync(join(ROOT, 'drinks'), { recursive: true, force: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(ROOT, rel)), { recursive: true });
    writeFileSync(join(ROOT, rel), text);
  }
  console.log(`Wrote ${Object.keys(files).length} files (${drinks.length} drinks, ${GROUPS.length} collections).`);
}
