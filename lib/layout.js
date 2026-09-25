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
<script>try{var u=new URL(location.href),h=new URLSearchParams(u.hash.slice(1));if(u.searchParams.has('code')||u.searchParams.has('error')||h.has('error')){var cb={code:u.searchParams.get('code'),error:u.searchParams.has('error')||h.has('error')};['code','error','error_code','error_description','sb_flow_id'].forEach(k=>u.searchParams.delete(k));u.hash='account';history.replaceState(Object.assign({},history.state,{bcAuthCallback:cb}),'',u.pathname+u.search+u.hash)}}catch(e){}</script>
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
<meta name="theme-color" content="#f8f8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#15241f" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="manifest" href="/assets/site.webmanifest">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180">
${ld}<script>try{var s=JSON.parse(localStorage.getItem('bc_settings')||'{}'),r=document.documentElement;if(s.theme==='light'||s.theme==='dark')r.dataset.theme=s.theme;if(s.motion==='reduce')r.dataset.motion='reduce'}catch(e){}</script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/overhaul.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="wrap">
  <header class="site-top brand-header">
    <a class="mark" href="/" aria-label="Brew Combos home"><span class="brand-icon" aria-hidden="true">b.</span>brew<span>combos</span><span class="brand-dot">✳</span></a>
    <nav aria-label="Site"><a href="/" ${path === '/' ? 'aria-current="page"' : ''}>Discover</a><a href="/#vibe" data-nav="vibe">The mixer</a><a href="/#community" data-nav="community">Community</a><a href="/#saved" data-nav="saved">My drinks <span data-saved-count>0</span></a></nav>
    <div class="header-actions"><button class="account-btn" type="button" data-account>Sign in <span aria-hidden="true">↗</span></button><button class="icon-btn" data-settings type="button" aria-label="Settings">⚙</button></div>
  </header>
${crumbs.length > 1 ? `  <nav class="crumbs" aria-label="Breadcrumb">${crumbs.slice(0, -1).map(([n, p]) => `<a href="${p}">${esc(n)}</a>`).join('<span aria-hidden="true">/</span>')}</nav>\n` : ''}${body.replace('<main ', '<main id="main" tabindex="-1" ')}
  <footer class="brand-footer"><a class="mark" href="/">brew<span>combos</span><span class="brand-dot">✳</span></a><p>An independent recipe book for your next 7 Brew order.<br>Not affiliated with 7 Brew. Flavors vary by stand and season.</p><nav aria-label="Footer"><a href="/drinks">All recipes</a><a href="/#community">Community</a><a href="/#saved">My drinks</a></nav><span class="footer-note">Made for the “what should I get?” people.</span></footer>
</div>
<script>
const done = b => { b.classList.add('done'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('done'), 1600) };
const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); return true } catch { prompt(label, text); return false } };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-say]');
  if (b && await copy(b.dataset.say, 'Copy your order:')) done(b);
});
</script>
<script type="module" src="/assets/settings.js"></script>
<script type="module" src="/assets/share.js"></script>
<script type="module" src="/assets/drink-page.js"></script>
<script type="module" src="/assets/page-tools.js"></script>
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
// Opens the share panel (assets/share.js). card: 1200x630 preview; the story image is the same URL with &format=story.
export const shareBtn = (href, title, text, card) => {
  const file = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  return `<button class="btn quiet" type="button" data-share="${esc(href)}" data-title="${esc(title)}" data-text="${esc(text)}" data-card="${esc(card)}" data-story="${esc(`${card}&format=story`)}" data-filename="${file}">Share</button>`;
};

// Drink page sections, drawn the same way by the generator and by assets/drink-page.js (saved settings).
export const factsHTML = o => M.orderFacts(o).map(([k, v]) =>
  `<div><dt>${k}</dt><dd>${k === 'Flavors' ? swatches(v) : esc(v)}</dd></div>`).join('');
export const variationsHTML = o => M.orderVariations(o).map(([k, v]) => `
          <li><p class="label">${esc(k)}</p><p>${esc(v)}</p>${copyBtn(v, 'Copy')}</li>`).join('');
