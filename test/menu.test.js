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

test('orderLine: energy requests both the sugar-free base and sugar-free syrups', () => {
  const o = combo({ drink: 'energy', flavors: ['Strawberry', 'Peach'], sf: true });
  assert.equal(M.orderLine(o), 'Can I get a medium sugar-free 7 Energy with sugar-free strawberry and sugar-free peach?');
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
  const all = M.allFlavors(['Honey', 'vanilla', 'Honey', 'HONEY']);
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

test('parseCombos: sugar-free strips sweet toppings and preserves requested sweetness', () => {
  const c = [{ ...good[0], drink: 'mocha', extras: ['whip', 'caramel', 'whitechoc', 'softtop', 'coldfoam', 'halfsweet', 'shot'] }];
  const [o] = M.parseCombos(reply(c), { sf: true });
  assert.equal(o.sf, true);
  assert.deepEqual(o.extras, ['shot']);
  assert.equal(o.sweet, 'half');
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

test('orderLine: blended drinks are Chillers', () => {
  assert.equal(M.orderLine(combo({ drink: 'energy', temp: 'frozen', flavors: ['Mango'] })), 'Can I get a medium 7 Energy chiller with mango?');
  assert.equal(M.orderLine(combo({ drink: 'latte', temp: 'frozen', milk: 'oat', flavors: ['Vanilla'] })), 'Can I get a medium oat milk latte chiller with vanilla?');
  assert.equal(M.orderLine(combo({ drink: 'energy', temp: 'frozen', sf: true, flavors: ['Peach'] })), 'Can I get a medium sugar-free 7 Energy chiller with sugar-free peach?');
  // smoothies and shakes only come blended, so no extra word
  assert.equal(M.orderLine(combo({ drink: 'smoothie', flavors: ['Strawberry'] })), 'Can I get a medium smoothie with strawberry?');
  assert.equal(M.baseLabel(combo({ drink: 'lemonade', temp: 'frozen' })), 'Medium Lemonade Chiller');
});

test('orderLine: soft top, drizzle names and sweetness', () => {
  const o = combo({ drink: 'energy', flavors: ['Strawberry'], extras: ['softtop', 'whitechoc'], sweet: 'half' });
  assert.equal(M.orderLine(o), 'Can I get a medium 7 Energy with strawberry, plus soft top, white chocolate drizzle, and half sweet?');
  assert.equal(M.orderLine(combo({ sweet: 'extra' })), 'Can I get a medium iced breve with extra sweet?');
  assert.equal(M.orderLine(combo({ extras: ['chocolate'] })), 'Can I get a medium iced breve with dark chocolate drizzle?');
  assert.deepEqual(combo({ drink: 'latte', temp: 'hot', extras: ['softtop'] }).extras, []);
});

test('fixCombo: sweetness defaults to regular and is independent of syrup type', () => {
  assert.equal(combo({}).sweet, 'regular');
  assert.equal(combo({ sweet: 'bogus' }).sweet, 'regular');
  assert.equal(combo({ sweet: 'quarter' }).sweet, 'quarter');
  assert.equal(combo({ sweet: 'quarter', sf: true }).sweet, 'quarter');
  assert.match(M.orderLine(combo({ flavors: ['Vanilla'], sweet: 'half', sf: true })), /sugar-free vanilla, plus half sweet/);
});

test('parseCombos: reads sweetness from the sweet field or from old-style extras', () => {
  assert.equal(M.parseCombos(reply([{ ...good[0], sweet: 'Half' }]))[0].sweet, 'half');
  const [o] = M.parseCombos(reply([{ ...good[0], extras: ['halfsweet', 'coldfoam'] }]));
  assert.equal(o.sweet, 'half');
  assert.deepEqual(o.extras, ['coldfoam']);
});

test('applyPrefs: size, milk where allowed, sugar-free', () => {
  const latte = combo({ drink: 'latte', milk: 'whole', flavors: ['Vanilla'] });
  assert.deepEqual([M.applyPrefs(latte, { size: 'large', milk: 'oat' })].map(o => [o.size, o.milk]), [['large', 'oat']]);
  assert.equal(M.applyPrefs(latte, {}).size, 'medium');
  assert.equal(M.applyPrefs(combo({ flavors: ['Caramel'] }), { milk: 'oat' }).milk, '');          // breve stays half & half
  assert.equal(M.applyPrefs(combo({ drink: 'coldbrew', milk: 'none' }), { milk: 'oat' }).milk, 'none');
  assert.equal(M.applyPrefs({ ...combo({ drink: 'latte' }), drink: 'coldbrew', milk: '' }, { milk: 'oat' }).milk, 'none');   // switching to cold brew keeps it black
  assert.equal(M.applyPrefs(combo({ drink: 'coldbrew', milk: 'cream' }), { milk: 'almond' }).milk, 'almond');
  assert.equal(M.applyPrefs(combo({ drink: 'coldbrew', milk: 'cream' }), { milk: 'skim' }).milk, 'cream');  // not offered on cold brew
  const sf = M.applyPrefs(combo({ sweet: 'half' }), { sf: true });
  assert.equal(sf.sf, true);
  assert.equal(sf.sweet, 'half');
  assert.equal(M.applyPrefs(sf, { sf: false }).sf, false);
  assert.equal(M.applyPrefs(sf, { size: 'large' }).sf, true);
  assert.equal(M.applyPrefs(sf).sf, true);
});

test('orderFacts and orderVariations follow the combo', () => {
  const o = combo({ drink: 'latte', milk: 'oat', flavors: ['Vanilla'], sweet: 'half' });
  const facts = Object.fromEntries(M.orderFacts(o));
  assert.equal(facts.Size, 'Medium');
  assert.equal(facts.Milk, 'Oat');
  assert.deepEqual(facts.Flavors, ['Vanilla']);
  assert.equal(facts.Sweetness, 'half sweet');
  assert.equal(facts.Caffeine, 'Yes');
  assert.equal(Object.fromEntries(M.orderFacts({ ...o, sf: true })).Syrups, 'Sugar-free');
  assert.deepEqual(M.orderVariations(o).map(v => v[0]), ['Ask for sugar-free syrups', 'Hot', 'Chiller', 'Large']);
  assert.deepEqual(M.orderVariations(M.fixCombo({ ...o, size: 'large', sf: true })).map(v => v[0]), ['Hot', 'Chiller']);
  assert.deepEqual(M.orderVariations(combo({ extras: ['whip'] })).map(v => v[0]), ['Hot', 'Chiller', 'Large']);  // whip: no sugar-free version
  assert.match(Object.fromEntries(M.orderFacts(combo({ drink: 'fizz' }))).Caffeine, /check add-ins/);
  assert.equal(Object.fromEntries(M.orderFacts(combo({ drink: 'tea' }))).Caffeine, 'Varies with tea choice');
});

test('recipe URLs restore declared custom flavors on another device', () => {
  const original = combo({ drink: 'latte', flavors: ['Vanilla', 'Honey'], extras: ['whip'], sweet: 'half', sf: true });
  const query = M.comboToQuery(original);
  assert.equal(new URLSearchParams(query).get('c'), 'Honey');
  assert.deepEqual(M.comboFromQuery(query), original);
  // A recipient's full custom list must not crowd out the shared recipe.
  assert.deepEqual(M.comboFromQuery(query, Array.from({ length: 12 }, (_, i) => `Mine ${i}`)), original);
  assert.deepEqual(M.comboFromQuery('drink=latte&f=Vanilla,Honey').flavors, ['Vanilla']);
  assert.equal(new URLSearchParams(M.comboToQuery(combo({ flavors: ['Vanilla'] }))).has('c'), false);
});

test('recipe URL input stays sanitized, deduplicated and bounded', () => {
  const query = new URLSearchParams({ drink: 'latte', c: '<script>,Honey,HONEY', f: '<script>,Honey,HONEY,Vanilla', x: 'whip,whip,invalid' });
  const parsed = M.comboFromQuery(query.toString());
  assert.deepEqual(parsed.flavors, ['script', 'Honey', 'Vanilla']);
  assert.deepEqual(parsed.extras, ['whip']);
  assert.doesNotMatch(M.orderLine(parsed), /[<>]/);
  const many = combo({ flavors: M.FLAVORS.slice(0, 10).map(f => f.name) });
  assert.equal(many.flavors.length, M.MAX_FLAVORS);
  assert.deepEqual(M.comboFromQuery(M.comboToQuery(many)), many);
  assert.equal(M.comboFromQuery('drink=latte&f=' + 'x'.repeat(8192)), null);
  assert.deepEqual(M.cleanCustom([null, {}, 42, ' Honey ', 'honey']), ['Honey']);
});
