import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPin } from '../scripts/daily-pin.js';

test('daily pin: fits Pinterest limits for every day of the year, dated image, right section', () => {
  const sections = new Set(['3888345227345702784', '3888345227648000064', '3888345222647777216', '3888345228386333760', '3888345413371574528']);
  for (let i = 0; i < 366; i++) {
    const p = dailyPin(new Date(2026, 0, 1 + i));
    assert.ok(p.title.length <= 100 && p.description.length <= 800 && p.alt_text.length <= 500, p.date);
    assert.ok(sections.has(p.board_section_id), `${p.date} section`);
    assert.match(p.image, /format=pin&l=day&date=[A-Za-z]+%2C\+[A-Za-z]+\+\d{1,2}&why=/);
    assert.match(p.link, new RegExp(`/drinks/${p.slug}\\?utm_source=pinterest`));
  }
  const halloween = dailyPin(new Date(2026, 9, 31));
  assert.equal(halloween.board_section_id, '3888345413371574528');   // holidays go in Fall & holiday drinks
  assert.match(halloween.description, /^Saturday, October 31\. Happy Halloween/);
});
