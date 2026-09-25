// Drink of the day: one pick per calendar day, the same for everyone on that date.
// Holidays get their own picks; other days score combos by season and a theme for the day of the week.
import { COMBOS } from './drinks.js';
import { DRINK } from './menu.js';

const BY_SLUG = Object.fromEntries(COMBOS.map(c => [c.slug, c]));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------- Dates ---------- */

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const md = d => (d.getMonth() + 1) * 100 + d.getDate();          // March 17 -> 317
// nth weekday of a month: nthWeekday(2026, 10, 4, 4) = 4th Thursday of November
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
// Western Easter (anonymous Gregorian algorithm)
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return month * 100 + day;
}

// [id, test(date), picks (rotate by year), why]
const HOLIDAYS = [
  ['new-year', d => md(d) === 101, ['rainbow-sherbet-energy', 'birthday-cake-breve'], "New Year's Day. Start the year with something bright."],
  ['valentines', d => md(d) === 214, ['strawberries-and-cream-shake', 'strawberry-shortcake-breve', 'pink-candy-energy'], "Valentine's Day, so it's pink and it's sweet."],
  ['st-patricks', d => md(d) === 317, ['irish-cream-cold-brew', 'green-apple-kiwi-energy', 'coconut-matcha'], "St. Patrick's Day. Wear green, drink green (or Irish cream)."],
  ['easter', d => md(d) === easter(d.getFullYear()), ['pink-candy-energy', 'orange-cream-fizz', 'strawberry-matcha'], 'Happy Easter. Pastel colors only today.'],
  ['mothers-day', d => d.getMonth() === 4 && d.getDate() === nthWeekday(d.getFullYear(), 4, 0, 2), ['lavender-vanilla-latte', 'lavender-matcha'], "Mother's Day. Pick one up for her too."],
  ['fathers-day', d => d.getMonth() === 5 && d.getDate() === nthWeekday(d.getFullYear(), 5, 0, 3), ['salted-caramel-cold-brew', 'english-toffee-breve'], "Father's Day. Something strong with a sweet finish."],
  ['july-4', d => md(d) === 704, ['cotton-candy-energy', 'blue-lagoon-energy'], 'Fourth of July: red, white and blue in one cup.'],
  ['coffee-day', d => md(d) === 929, ['salted-caramel-cold-brew', 'creme-brulee-breve'], "It's National Coffee Day."],
  ['halloween', d => md(d) === 1031, ['caramel-apple-breve', 'smores-mocha', 'grape-blue-raspberry-energy'], 'Happy Halloween. Treat, no trick.'],
  ['thanksgiving', d => d.getMonth() === 10 && d.getDate() === nthWeekday(d.getFullYear(), 10, 4, 4), ['pumpkin-pie-latte', 'pumpkin-chai'], 'Thanksgiving. Pie comes early this year.'],
  ['christmas-eve', d => md(d) === 1224, ['gingerbread-latte', 'peppermint-mocha'], 'Christmas Eve. Something warm for the wait.'],
  ['christmas', d => md(d) === 1225, ['peppermint-mocha', 'gingerbread-latte'], 'Merry Christmas.'],
  ['new-years-eve', d => md(d) === 1231, ['red-berry-energy', 'cotton-candy-energy'], "New Year's Eve. You're staying up until midnight."],
  ['first-day-of-spring', d => md(d) === 320, ['strawberry-matcha', 'strawberry-lemonade'], 'First day of spring.'],
  ['first-day-of-summer', d => md(d) === 621, ['watermelon-lime-energy', 'mango-pineapple-smoothie'], 'First day of summer.'],
  ['first-day-of-fall', d => md(d) === 922, ['pumpkin-chai', 'caramel-apple-breve'], 'First day of fall.'],
  ['first-day-of-winter', d => md(d) === 1221, ['french-vanilla-chai', 'peppermint-mocha'], 'First day of winter. Hot drink weather.'],
];

/* ---------- Scoring ordinary days ---------- */

const seasonOf = d => [11, 0, 1].includes(d.getMonth()) ? 'winter' : d.getMonth() <= 4 ? 'spring' : d.getMonth() <= 7 ? 'summer' : 'fall';
// When each seasonal flavor is on offer. Outside these windows those drinks are skipped.
const IN_SEASON = {
  'Pumpkin Spice': d => md(d) >= 901 && md(d) <= 1130,
  'Peppermint': d => md(d) >= 1115 || md(d) <= 105,
  'Gingerbread': d => md(d) >= 1115 || md(d) <= 105,
};
const DESSERT = ['whip', 'caramel', 'chocolate', 'whitechoc', 'softtop'];

const DAY_THEMES = [
  { why: 'Sunday: easy, cozy, no rush.', score: (c, d) => (d.cat === 'nocaf' ? 2 : 0) + (['chai', 'latte'].includes(d.id) ? 2 : 0) },
  { why: 'Monday. You need the caffeine.', score: (c, d) => (d.id === 'energy' || d.id === 'coldbrew' || c.extras.includes('shot') ? 3 : 0) + (d.cat === 'nocaf' ? -3 : 0) },
  { why: 'Tuesday: something bright to get you through it.', score: (c, d) => (d.id === 'energy' || d.id === 'fizz' || d.id === 'lemonade' ? 2 : 0) },
  { why: 'Halfway through the week. That earns a treat.', score: (c, d) => (d.cat === 'coffee' && c.extras.some(x => DESSERT.includes(x)) ? 3 : 0) },
  { why: 'Thursday is for something calmer.', score: (c, d) => (d.cat === 'tea' ? 3 : 0) + (c.sweet !== 'regular' ? 1 : 0) },
  { why: "It's Friday. Dessert counts as a drink.", score: (c, d) => (d.id === 'shake' || c.temp === 'frozen' ? 2 : 0) + (c.extras.some(x => DESSERT.includes(x)) ? 1 : 0) },
  { why: 'Saturday: go big.', score: (c, d) => (c.size === 'large' || c.temp === 'frozen' || d.id === 'energy' ? 2 : 0) },
];

const SEASON_LINE = {
  'Pumpkin Spice': 'Pumpkin season only lasts so long.',
  'Peppermint': "It's peppermint season.",
  'Gingerbread': "It's gingerbread season.",
};

function scoreSeason(c, date) {
  const season = seasonOf(date);
  let s = 0;
  if (season === 'summer') s += c.temp === 'hot' ? -4 : c.temp === 'frozen' ? 2 : 1;
  if (season === 'winter') s += c.temp === 'hot' ? 2 : c.temp === 'frozen' ? -2 : 0;
  if (season === 'fall' && c.temp === 'hot') s += 1;
  if (c.flavors.some(f => IN_SEASON[f])) s += 1;   // a nudge, not a takeover; only reachable in season (see eligible)
  return s;
}
const eligible = (c, date) => c.combo.flavors.every(f => !IN_SEASON[f] || IN_SEASON[f](date));

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function ordinaryPick(date, skip) {
  const theme = DAY_THEMES[date.getDay()];
  const scored = COMBOS.filter(c => !skip.includes(c.slug) && eligible(c, date))
    .map(c => ({ c, s: scoreSeason(c.combo, date) + theme.score(c.combo, DRINK[c.combo.drink]) }));
  const best = Math.max(...scored.map(x => x.s));
  const pool = scored.filter(x => x.s >= best - 1).map(x => x.c);
  return pool[hash(ymd(date)) % pool.length];
}

function holidayPick(date) {
  const h = HOLIDAYS.find(([, test]) => test(date));
  return h && { drink: BY_SLUG[h[2][date.getFullYear() % h[2].length]], why: h[3], holiday: h[0] };
}

/* Returns { drink, why, label, holiday } for the given local date.
   Walks forward from January 1 so each day knows the last six picks and never repeats one within a week. */
export function drinkOfTheDay(date = new Date()) {
  const label = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  let recent = [], today;
  for (let d = new Date(date.getFullYear(), 0, 1); d <= date; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    today = holidayPick(d) || { drink: ordinaryPick(d, recent), holiday: null };
    recent = [today.drink.slug, ...recent].slice(0, 6);
  }
  if (!today.holiday) {
    const seasonal = today.drink.combo.flavors.find(f => SEASON_LINE[f]);
    today.why = DAY_THEMES[date.getDay()].why + (seasonal ? ` ${SEASON_LINE[seasonal]}` : '');
  }
  return { ...today, label };
}

export { HOLIDAYS };
