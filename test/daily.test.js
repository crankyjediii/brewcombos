import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drinkOfTheDay, HOLIDAYS } from '../lib/daily.js';
import { COMBOS } from '../lib/drinks.js';

const year = y => Array.from({ length: 365 }, (_, i) => new Date(y, 0, 1 + i));

test('every holiday pick is a real drink', () => {
  const slugs = new Set(COMBOS.map(c => c.slug));
  for (const [id, , picks] of HOLIDAYS) for (const p of picks) assert.ok(slugs.has(p), `${id}: ${p}`);
});

test('holidays land on the right days', () => {
  const on = (y, m, d) => drinkOfTheDay(new Date(y, m - 1, d)).holiday;
  assert.equal(on(2026, 10, 31), 'halloween');
  assert.equal(on(2026, 11, 26), 'thanksgiving');   // 4th Thursday
  assert.equal(on(2027, 11, 25), 'thanksgiving');
  assert.equal(on(2026, 4, 5), 'easter');
  assert.equal(on(2027, 3, 28), 'easter');
  assert.equal(on(2026, 5, 10), 'mothers-day');     // 2nd Sunday of May
  assert.equal(on(2026, 7, 4), 'july-4');
  assert.equal(on(2026, 7, 5), null);
});

test('same date, same drink', () => {
  const a = drinkOfTheDay(new Date(2026, 8, 25, 8)), b = drinkOfTheDay(new Date(2026, 8, 25, 22));
  assert.equal(a.drink.slug, b.drink.slug);
  assert.equal(a.label, 'Friday, September 25');
});

for (const y of [2026, 2027]) {
  test(`${y}: seasonal flavors only in season, no hot drinks in summer, no repeats within a week`, () => {
    const recent = [];
    const seen = new Set();
    for (const d of year(y)) {
      const r = drinkOfTheDay(d), c = r.drink.combo, m = d.getMonth();
      seen.add(r.drink.slug);
      if (c.flavors.includes('Pumpkin Spice')) assert.ok(m >= 8 && m <= 10, `pumpkin on ${d.toDateString()}`);
      if (c.flavors.some(f => f === 'Peppermint' || f === 'Gingerbread')) assert.ok(m === 11 || m === 10 || (m === 0 && d.getDate() <= 5), `holiday flavor on ${d.toDateString()}`);
      if (m >= 5 && m <= 7) assert.notEqual(c.temp, 'hot', `hot drink on ${d.toDateString()}`);
      if (!r.holiday) assert.ok(!recent.includes(r.drink.slug), `${r.drink.slug} repeated on ${d.toDateString()}`);
      assert.ok(r.why.length > 5);
      recent.unshift(r.drink.slug); recent.length = Math.min(recent.length, 6);
    }
    assert.ok(seen.size >= 50, `only ${seen.size} different drinks in a year`);
  });
}
