import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS } from '../lib/drinks.js';
import { DRINK } from '../lib/menu.js';
import { recommendCombos, searchCombos, tasteTags } from '../lib/discovery.js';

const pick = slug => COMBOS.find(recipe => recipe.slug === slug);
const slugs = list => list.map(recipe => recipe.slug);

test('search combines words across a recipe name, ingredients, and base', () => {
  const found = searchCombos(COMBOS, { query: 'strawberry peach energy' });
  assert.ok(found.length);
  assert.ok(found.every(recipe => recipe.combo.drink === 'energy' &&
    recipe.combo.flavors.includes('Strawberry') && recipe.combo.flavors.includes('Peach')));
  assert.deepEqual(searchCombos(COMBOS, { query: 'strawberry impossibleflavor' }), []);
});

test('accented and unaccented queries match the same recipes', () => {
  assert.deepEqual(slugs(searchCombos(COMBOS, { query: 'creme brulee' })),
    slugs(searchCombos(COMBOS, { query: 'CRÈME BRÛLÉE' })));
  assert.ok(searchCombos(COMBOS, { query: 'pina colada' }).length);
});

test('category, temperature, taste and ingredient exclusions apply together', () => {
  const found = searchCombos(COMBOS, { category: 'energy', temp: 'iced', taste: 'tropical', exclude: ['Coconut'] });
  assert.ok(found.length);
  assert.ok(found.every(recipe => recipe.combo.drink === 'energy' && recipe.combo.temp === 'iced' &&
    tasteTags(recipe).includes('tropical') && !recipe.combo.flavors.includes('Coconut')));
  assert.ok(!found.includes(pick('pina-colada-energy')));
});

test('exclude checks actual base, milk and topping ingredients, not recipe names', () => {
  const recipes = [
    { name: 'Coconut daydream', combo: { drink: 'latte', milk: 'oat', flavors: ['Vanilla'] } },
    { name: 'Vanilla latte', combo: { drink: 'latte', milk: 'coconut', flavors: ['Vanilla'] } },
    { name: 'Chocolate mocha', combo: { drink: 'mocha', flavors: ['Hazelnut'] } },
    { name: 'Vanilla shake', combo: { drink: 'shake', flavors: ['Vanilla'], extras: ['chocolate'] } },
  ];
  assert.deepEqual(searchCombos(recipes, { exclude: 'coconut, chocolate' }), [recipes[0]]);
});

test('taste tags accept raw combos and recipes and describe overlapping tastes', () => {
  const recipe = pick('pina-colada-energy');
  assert.deepEqual(tasteTags(recipe), tasteTags(recipe.combo));
  assert.ok(tasteTags(recipe).includes('tropical'));
  assert.ok(tasteTags(recipe).includes('creamy'));
  assert.ok(tasteTags(pick('peppermint-mocha')).includes('seasonal'));
  assert.ok(tasteTags(pick('peppermint-mocha')).includes('chocolate'));
  assert.deepEqual(tasteTags({ drink: 'americano', flavors: [] }), []);
});

test('source order is the default; alphabetical search does not mutate the catalog', () => {
  const before = slugs(COMBOS);
  assert.deepEqual(slugs(searchCombos(COMBOS)), before);
  const sorted = searchCombos(COMBOS, { sort: 'name' });
  assert.notDeepEqual(slugs(sorted), before);
  assert.deepEqual(slugs(COMBOS), before);
});

test('recommendations rank matching ingredients first and fill without an API', () => {
  const found = recommendCombos(COMBOS, { query: 'I want strawberry peach', kind: 'energy' });
  assert.equal(found.length, 3);
  assert.equal(found[0].slug, 'strawberry-peach-energy');
  assert.ok(found.every(recipe => DRINK[recipe.combo.drink].cat === 'energy'));
  assert.deepEqual(found, recommendCombos(COMBOS, { query: 'I want strawberry peach', kind: 'energy' }));
});

test('recommendation taste hints and exclusions are deterministic', () => {
  const found = recommendCombos(COMBOS, { query: 'a tropical beach drink', kind: 'energy', exclude: ['Coconut'], limit: 2 });
  assert.equal(found.length, 2);
  assert.ok(found.every(recipe => tasteTags(recipe).includes('tropical') && !recipe.combo.flavors.includes('Coconut')));
  assert.deepEqual(recommendCombos(COMBOS, { query: 'unknown feeling', limit: 2 }), COMBOS.slice(0, 2));
  assert.deepEqual(recommendCombos(COMBOS, { limit: 0 }), []);
  assert.deepEqual(recommendCombos([], { query: 'peach' }), []);
});
