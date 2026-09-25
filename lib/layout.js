// Page shell and small pieces shared by the generated pages (scripts/build-pages.js) and the share page (api/share.js).
import * as M from './menu.js';
import { cupSVG, cupLook } from './cup.js';

export const SITE = 'https://brewcombos.com';
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorOf = n => M.flavorColor(n);

export function page({ path, title, description, body, crumbs = [], image = `${SITE}/assets/og.png`, noindex = false }) {
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
${noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Brew Combos">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
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
const done = b => { b.classList.add('done'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('done'), 1600) };
const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); return true } catch { prompt(label, text); return false } };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-say]');
  if (b && await copy(b.dataset.say, 'Copy your order:')) done(b);
  const s = e.target.closest('[data-share]'); if (!s) return;
  const url = new URL(s.dataset.share, location.href).href;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: s.dataset.title, text: s.dataset.text, url }) } catch {}
  } else if (await copy(url, 'Copy this link:')) done(s);
});
</script>
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) };</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

let cupId = 0;
export const resetCups = () => { cupId = 0 };
export const cup = o => `<div class="cup">${cupSVG(`s${++cupId}`, cupLook(o, colorOf))}</div>`;
export const mini = o => {
  const s = cupLook(o, colorOf).stops;
  return `<span class="mini" aria-hidden="true" style="--a:${s[1]};--b:${s[2]};--c:${s[4]}"></span>`;
};
export const swatches = flavors => `<ul class="flavors-inline">${flavors.map(f =>
  `<li><span class="sw" style="--c:${colorOf(f)}"></span>${esc(f)}</li>`).join('')}</ul>`;
export const copyBtn = (line, label = 'Copy order') =>
  `<button class="btn" type="button" data-say="${esc(line)}"><span class="idle">${label}</span><span class="ok">Copied</span></button>`;
export const shareBtn = (href, title, text) =>
  `<button class="btn quiet" type="button" data-share="${esc(href)}" data-title="${esc(title)}" data-text="${esc(text)}"><span class="idle">Share</span><span class="ok">Link copied</span></button>`;
