// GET /s?drink=energy&temp=iced&f=Strawberry,Peach&n=Name  ->  a page for a shared drink.
// The link preview (title, order line, drink image) is what makes a shared link worth tapping.
// Keep this free of lib/card.js: the image libraries are heavy and only api/card.js bundles their files.
import * as M from '../lib/menu.js';
import { SITE, esc, page, cup, copyBtn, shareBtn } from '../lib/layout.js';
import { cardURL } from '../scripts/build-pages.js';
import { COMBOS } from '../lib/drinks.js';

export default function handler(req, res) {
  const url = new URL(req.url, SITE);
  const o = M.comboFromQuery(url.search);
  if (!o) {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  const name = M.cleanName(url.searchParams.get('n'));
  const title = M.comboTitle(o, name);
  const line = M.orderLine(o);
  const query = M.comboToQuery(o) + (name ? `&n=${encodeURIComponent(name)}` : '');

  const html = page({
    path: `/s?${query}`,
    title: `${title} · a 7 Brew order`,
    description: `Say this at the window: "${line}"`,
    image: cardURL(o, name),
    noindex: true,
    body: `
  <main class="drink-page">
    <article class="drink-hero">
      ${cup(o)}
      <div>
        <p class="label">Shared with you</p>
        <h1>${esc(title)}</h1>
        <p class="lede">${esc(M.baseLabel(o))}${o.sf ? ', sugar-free' : ''}. Read the line below at any 7 Brew window.</p>
        <div class="say">
          <p class="label">Say this at the window</p>
          <p class="line">${esc(line)}</p>
          <div class="actions">
            ${copyBtn(line)}
            <a class="btn quiet" href="${esc(`/?${M.comboToQuery(o)}#build`)}">Tweak it</a>
            ${shareBtn(`/s?${query}`, title, line, cardURL(o, name))}
          </div>
        </div>
      </div>
    </article>
    <aside class="nudge">
      <p><strong>Want one for your own mood?</strong> Describe it in a few words and get three drinks, or <a href="/drinks">browse ${COMBOS.length} combos</a>.</p>
      <a class="btn primary" href="/">Mix from a vibe</a>
    </aside>
  </main>`,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
  res.end(html);
}
