import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../lib/menu.js';

const combo = o => M.fixCombo({ drink: 'breve', temp: 'iced', size: 'medium', milk: '', flavors: [], extras: [], sf: false, ...o });

test('every flavor has a family the picker knows and a hex color', () => {
  for (const f of M.FLAVORS) {
    assert.ok(M.FAMILIES[f.family], `${f.name} has unknown family ${f.family}`);
    assert.match(f.color, /^#[0-9A-F]{6}$/i, f.name);
  }
  const names = M.FLAVORS.map(f => f.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'duplicate flavor names');
});

test('every drink has a valid milk type and at least one temp', () => {
  for (const d of M.DRINKS) {
    assert.ok(d.temps.length, d.id);
    assert.ok(['fixed', 'choice', 'optional', 'none'].includes(d.milk), d.id);
    if (d.quiet) assert.ok(d.temps.includes(d.quiet), `${d.id} quiet temp not in temps`);
  }
});

test('orderLine: plain breve', () => {
  assert.equal(M.orderLine(combo({ flavors: ['Caramel'] })), 'Can I get a medium iced breve with caramel?');
});

test('orderLine: energy drops "iced" (the default) and puts sugar-free on the base', () => {
  const o = combo({ drink: 'energy', flavors: ['Strawberry', 'Peach'], sf: true });
  assert.equal(M.orderLine(o), 'Can I get a medium sugar-free 7 Energy with strawberry and peach?');
});

test('orderLine: sugar-free on each syrup for non-energy drinks', () => {
  const o = combo({ drink: 'latte', temp: 'hot', milk: 'oat', flavors: ['Vanilla', 'Hazelnut'], sf: true });
  assert.equal(M.orderLine(o), 'Can I get a medium hot oat milk latte with sugar-free vanilla and sugar-free hazelnut?');
});

test('orderLine: extras, three flavors, oxford comma', () => {
  const o = combo({ drink: 'mocha', size: 'large', flavors: ['Caramel', 'Hazelnut', 'Almond'], extras: ['whip', 'shot'] });
  assert.equal(M.orderLine(o), 'Can I get a large iced mocha with caramel, hazelnut, and almond, plus whipped cream and an extra shot?');
});

test('orderLine: no flavors reads naturally', () => {
  assert.equal(M.orderLine(combo({ extras: ['whip'] })), 'Can I get a medium iced breve with whipped cream?');
  assert.equal(M.orderLine(combo({})), 'Can I get a medium iced breve?');
});

test('orderLine: cold brew with cream', () => {
  const o = combo({ drink: 'coldbrew', milk: 'cream', flavors: ['Vanilla'] });
  assert.equal(M.orderLine(o), 'Can I get a medium cold brew with vanilla, plus a splash of cream?');
});

test('fixCombo repairs impossible combinations', () => {
  const o = combo({ drink: 'smoothie', temp: 'hot', size: 'huge', milk: 'oat', extras: ['coldfoam', 'shot', 'lightice', 'whip', 'whip'] });
  assert.equal(o.temp, 'frozen');
  assert.equal(o.size, 'medium');
  assert.equal(o.milk, '');
  assert.deepEqual(o.extras, ['coldfoam', 'whip']);
  assert.equal(combo({ drink: 'nope' }).drink, 'breve');
  assert.equal(combo({ drink: 'latte', milk: 'goat' }).milk, 'whole');
  assert.equal(combo({ drink: 'coldbrew', milk: 'goat' }).milk, 'none');
  assert.deepEqual(combo({ drink: 'latte', temp: 'hot', extras: ['coldfoam', 'lightice'] }).extras, []);
});

test('cleanCustom strips markup, trims and caps the list', () => {
  assert.deepEqual(M.cleanCustom(['  <b>Honey</b>  ', '', 'Crème Brûlée', 'a'.repeat(50)]), ['bHoneyb', 'Crème Brûlée', 'a'.repeat(30)]);
  assert.equal(M.cleanCustom(Array.from({ length: 20 }, (_, i) => `F${i}`)).length, 12);
  assert.deepEqual(M.cleanCustom('nope'), []);
  assert.deepEqual(M.cleanCustom(null), []);
});

test('allFlavors adds custom flavors once and skips menu duplicates', () => {
  const all = M.allFlavors(['Honey', 'vanilla']);
  assert.equal(all.length, M.FLAVORS.length + 1);
  assert.equal(all.at(-1).family, 'yours');
  assert.match(M.flavorColor('Honey', ['Honey']), /^hsl/);
});

const reply = combos => JSON.stringify({ combos });
const good = [
  { name: 'A', drink: 'latte', temp: 'iced', size: 'large', milk: 'oat', flavors: ['Vanilla'], extras: ['coldfoam'], why: 'x' },
  { name: 'B', drink: '7 Energy', temp: 'iced', size: 'medium', milk: '', flavors: ['strawberry', 'SF Peach'], extras: [], why: 'y' },
  { name: 'C', drink: 'Cold Brew', temp: 'iced', size: 'small', milk: 'cream', flavors: ['Caramel'], extras: [], why: 'z' },
];

test('parseCombos: clean JSON, loose drink names and flavor casing', () => {
  const out = M.parseCombos(reply(good));
  assert.equal(out.length, 3);
  assert.equal(out[1].drink, 'energy');
  assert.deepEqual(out[1].flavors, ['Strawberry', 'Peach']);
  assert.equal(out[2].drink, 'coldbrew');
});

test('parseCombos: markdown fences, think tags and chatter around the JSON', () => {
  const text = `<think>hmm {not json}</think>Sure! Here you go:\n\`\`\`json\n${reply(good)}\n\`\`\`\nEnjoy!`;
  assert.equal(M.parseCombos(text).length, 3);
});

test('parseCombos: bare array', () => {
  assert.equal(M.parseCombos(JSON.stringify(good)).length, 3);
});

test('parseCombos: salvages good drinks when one is malformed', () => {
  const text = `{"combos":[${JSON.stringify(good[0])},{"name":"broken","drink":"latte",,},${JSON.stringify(good[2])}]}`;
  const out = M.parseCombos(text);
  assert.deepEqual(out.map(o => o.name), ['A', 'C']);
});

test('parseCombos: drops drinks with no known flavors or unknown bases, caps at 3', () => {
  const bad = [{ drink: 'latte', flavors: ['Unicorn'] }, { drink: 'soup', flavors: ['Vanilla'] }];
  assert.equal(M.parseCombos(reply([...bad, ...good, good[0]])).length, 3);
  assert.throws(() => M.parseCombos(reply(bad)), /no usable drinks/);
  assert.throws(() => M.parseCombos(''), /no usable drinks/);
  assert.throws(() => M.parseCombos('{}'), /no usable drinks/);
});

test('parseCombos: accepts custom flavors only when sent', () => {
  const c = [{ ...good[0], flavors: ['Honey'] }];
  assert.throws(() => M.parseCombos(reply(c)));
  assert.deepEqual(M.parseCombos(reply(c), { custom: ['Honey'] })[0].flavors, ['Honey']);
});

test('parseCombos: sugar-free strips whip, drizzle and half sweet', () => {
  const c = [{ ...good[0], drink: 'mocha', extras: ['whip', 'caramel', 'halfsweet', 'shot'] }];
  const [o] = M.parseCombos(reply(c), { sf: true });
  assert.equal(o.sf, true);
  assert.deepEqual(o.extras, ['shot']);
});

test('parseCombos: trims long names and reasons', () => {
  const [o] = M.parseCombos(reply([{ ...good[0], name: 'N'.repeat(99), why: 'W'.repeat(999) }]));
  assert.equal(o.name.length, 40);
  assert.equal(o.why.length, 220);
});

test('prompts list every flavor and respect the drink-type filter', () => {
  const sp = M.systemPrompt(['Honey']);
  for (const f of M.FLAVORS) assert.ok(sp.includes(f.name), f.name);
  assert.ok(sp.includes('Honey'));
  assert.match(M.userPrompt('x', 'nocaf', true), /caffeine-free[\s\S]*sugar-free/);
  assert.match(M.userPrompt('x', 'bogus', false), /Any drink type/);
});

test('parseCombos: drops drinks that break the drink-type filter', () => {
  const mixed = [good[0], good[1], { ...good[0], name: 'Pop', drink: 'fizz', flavors: ['Cherry'] }];
  assert.deepEqual(M.parseCombos(reply(mixed), { kind: 'coffee' }).map(o => o.drink), ['latte']);
  assert.deepEqual(M.parseCombos(reply(mixed), { kind: 'energy' }).map(o => o.drink), ['energy']);
  assert.deepEqual(M.parseCombos(reply(mixed), { kind: 'nocaf' }).map(o => o.drink), ['fizz']);
  assert.equal(M.parseCombos(reply(mixed), { kind: 'any' }).length, 3);
  assert.throws(() => M.parseCombos(reply([good[0]]), { kind: 'nocaf' }), /no usable drinks/);
});
