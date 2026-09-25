// GET /card.png?drink=energy&temp=iced&f=Strawberry,Peach&n=Name  ->  1200x630 PNG preview for a shared drink.
// Add &format=story for a 1080x1920 image for stories (&l=day labels it "Drink of the day"), &format=pin for 1000x1500 Pinterest.
// The same query always draws the same image, so the CDN keeps it for a year.
import { comboFromQuery } from '../lib/menu.js';
import { cardPNG, cleanName } from '../lib/card.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://brewcombos.com');
  const o = comboFromQuery(url.search);
  if (!o) {
    res.statusCode = 302;
    res.setHeader('Location', '/assets/og.png');
    return res.end();
  }
  try {
    const q = url.searchParams;
    // Drink-of-the-day pins: a date like "Friday, September 25" and the day's reason line
    const date = /^[A-Za-z]+, [A-Za-z]+ \d{1,2}$/.test(q.get('date') || '') ? q.get('date') : '';
    const why = String(q.get('why') || '').replace(/[^\p{L}\p{N} '’.,!?:()&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 110);
    const png = await cardPNG(o, cleanName(q.get('n')), { format: q.get('format'), label: q.get('l'), date, why });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.end(png);
  } catch (e) {
    console.error(`[card] ${e.message}`);
    res.statusCode = 302;
    res.setHeader('Location', '/assets/og.png');
    res.end();
  }
}
