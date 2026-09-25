// Generates the drink pages, collection pages and sitemap from lib/drinks.js.
//   npm run pages        write the files
// The output is committed, so Vercel serves plain HTML with no build step.
// test/pages.test.js fails if the committed files are out of date.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/menu.js';
import { cupSVG, cupLook } from '../lib/cup.js';
import { COMBOS, GROUPS } from '../lib/drinks.js';

const SITE = 'https://brewcombos.com';
const UPDATED = '2026-09-24';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorOf = n => M.flavorColor(n);
const drinks = COMBOS.map(c => ({ ...c, combo: M.fixCombo(c.combo) }));
const D = c => M.DRINK[c.combo.drink];
const inGroup = (g, c) => g.fits(c.combo, D(c));
const PRIMARY = GROUPS.filter(g => ['energy', 'coffee', 'tea-chai-matcha', 'no-caffeine'].includes(g.slug));
const primaryOf = c => PRIMARY.find(g => inGroup(g, c));
const sfOk = c => GROUPS.find(g => g.sugarFree).fits(c.combo, D(c));
const caffeine = c => D(c).cat !== 'nocaf';

/* ---------- Shared pieces ---------- */

function page({ path, title, description, body, crumbs = [] }) {
  const url = SITE + path;
  const ld = crumbs.length ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })),
  })}</script>\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Brew Combos">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F5EFE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17110E" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 8h20l-2.6 20.5a2 2 0 0 1-2 1.5H10.6a2 2 0 0 1-2-1.5z' fill='%23C8432B'/><path d='M6.9 15h18.2' stroke='%23F5EFE6' stroke-width='2'/><rect x='4' y='5' width='24' height='4' rx='2' fill='%23221610'/></svg>">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
${ld}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<div class="wrap">
  <header class="site-top">
    <a class="mark" href="/">Brew Combos</a>
    <nav aria-label="Site">
      <a href="/">From a vibe</a>
      <a href="/#build">Build my own</a>
      <a href="/drinks"${path.startsWith('/drinks') ? ' aria-current="page"' : ''}>All drinks</a>
    </nav>
  </header>
${crumbs.length > 1 ? `  <nav class="crumbs" aria-label="Breadcrumb">${crumbs.slice(0, -1).map(([n, p]) => `<a href="${p}">${esc(n)}</a>`).join('<span aria-hidden="true">/</span>')}</nav>\n` : ''}${body}
  <footer>Not affiliated with 7 Brew. Flavors change by stand and season, so if your Brewista doesn't have one, ask what's close.</footer>
</div>
<script>
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-say]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.say) } catch { prompt('Copy your order:', b.dataset.say); return }
  b.classList.add('done'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('done'), 1600);
});
</script>
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) };</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

let cupId = 0;
const cup = o => `<div class="cup">${cupSVG(`s${++cupId}`, cupLook(o, colorOf))}</div>`;
const mini = o => {
  const s = cupLook(o, colorOf).stops;
  return `<span class="mini" aria-hidden="true" style="--a:${s[1]};--b:${s[2]};--c:${s[4]}"></span>`;
};
const swatches = flavors => `<ul class="flavors-inline">${flavors.map(f =>
  `<li><span class="sw" style="--c:${colorOf(f)}"></span>${esc(f)}</li>`).join('')}</ul>`;
const copyBtn = (line, label = 'Copy order') =>
  `<button class="btn" type="button" data-say="${esc(line)}"><span class="idle">${label}</span><span class="ok">Copied</span></button>`;
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
  cupId = 0;
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
