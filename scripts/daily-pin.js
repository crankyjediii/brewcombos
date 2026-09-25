// The Pinterest pin for today's Drink of the Day, used by the daily scheduled task.
//   node scripts/daily-pin.js              print today's pin as JSON (with "alreadyPosted" if it's done)
//   node scripts/daily-pin.js --date 2026-10-31
//   node scripts/daily-pin.js --mark <pinId>   record that today's pin was posted
// The log lives in .marketing/daily-pins.json (git-ignored), so a day is never posted twice.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/menu.js';
import { drinkOfTheDay } from '../lib/daily.js';
import { GROUPS } from '../lib/drinks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, '.marketing', 'daily-pins.json');
const BOARD = '852587841897387342';                       // "7 Brew Drink Combos" on @brewcombos
const SECTIONS = {                                       // board sections on that board
  energy: '3888345227345702784',
  coffee: '3888345227648000064',
  'tea-chai-matcha': '3888345222647777216',
  'no-caffeine': '3888345228386333760',
  seasonal: '3888345413371574528',
};

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const readLog = () => { try { return JSON.parse(readFileSync(LOG, 'utf8')) } catch { return {} } };

export function dailyPin(date = new Date()) {
  const day = drinkOfTheDay(date);
  const c = day.drink, o = M.fixCombo(c.combo), line = M.orderLine(o), D = M.DRINK[o.drink];
  const seasonal = day.holiday || o.flavors.some(f => (M.FLAVORS.find(x => x.name === f) || {}).family === 'seasonal');
  const group = GROUPS.find(g => SECTIONS[g.slug] && g.fits(o, D));
  const q = new URLSearchParams({ n: c.name, format: 'pin', l: 'day', date: day.label, why: day.why });
  const variations = M.orderVariations(o).map(v => v[0] === 'Chiller' ? 'Chiller' : v[0].toLowerCase());
  const also = variations.length ? ` The page also has ${M.joinList(variations)} versions.` : '';
  return {
    date: ymd(date),
    slug: c.slug,
    board_id: BOARD,
    board_section_id: SECTIONS[seasonal ? 'seasonal' : group.slug],
    title: `Drink of the Day: ${c.name} | 7 Brew combo`.slice(0, 100),
    description: `${day.label}. ${day.why} Today's 7 Brew pick is the ${c.name}: ${c.blurb} Order it by saying: "${line}"${also} Fan-made 7 Brew secret menu idea from Brew Combos, not affiliated with 7 Brew.`.slice(0, 800),
    alt_text: `Drink of the Day for ${day.label}: an illustrated cup of ${c.name}, with the order: ${line}`.slice(0, 500),
    link: `https://brewcombos.com/drinks/${c.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=drink_of_the_day`,
    image: `https://brewcombos.com/card.png?${M.comboToQuery(o)}&${q.toString()}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--date');
  const date = at >= 0 ? new Date(`${args[at + 1]}T12:00:00`) : new Date();
  const pin = dailyPin(date);
  const log = readLog();
  const mark = args.indexOf('--mark');
  if (mark >= 0) {
    const id = args[mark + 1];
    if (!/^\d+$/.test(id || '')) { console.error('Usage: --mark <numeric pin id>'); process.exit(1) }
    if (log[pin.date]) { console.error(`${pin.date} is already recorded as pin ${log[pin.date].pin_id}`); process.exit(1) }
    log[pin.date] = { pin_id: id, slug: pin.slug, posted_at: new Date().toISOString() };
    if (!existsSync(dirname(LOG))) mkdirSync(dirname(LOG), { recursive: true });
    writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
    console.log(`Recorded ${pin.date}: ${pin.slug} (pin ${id})`);
  } else {
    console.log(JSON.stringify({ ...pin, alreadyPosted: log[pin.date] || null }, null, 2));
  }
}
