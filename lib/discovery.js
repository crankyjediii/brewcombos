import { DRINK, EXTRA, FLAVORS } from './menu.js';

// These are browsing labels inferred from ingredients, not nutrition or allergy claims.
const normalized = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const flavorByName = new Map(FLAVORS.map(flavor => [normalized(flavor.name), flavor]));
const tropical = new Set(['coconut', 'pineapple', 'mango', 'passion fruit', 'banana']);
const creamyBases = new Set(['breve', 'latte', 'mocha', 'chai', 'matcha', 'shake']);
const creamyExtras = new Set(['cream', 'whip', 'softtop', 'coldfoam']);
const categories = new Set(['coffee', 'energy', 'tea', 'nocaf']);
const getCombo = recipe => recipe?.combo ?? recipe ?? {};
const words = value => normalized(value).split(' ').filter(Boolean);
const containsPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `);

/** Stable taste labels for a raw combo or a catalog recipe. Labels may overlap. */
export function tasteTags(recipe) {
  const combo = getCombo(recipe);
  const flavors = (combo.flavors || []).map(normalized);
  const tags = [];
  if (flavors.some(name => flavorByName.get(name)?.family === 'fruit' || name === 'banana')) tags.push('fruity');
  if (creamyBases.has(combo.drink) || (combo.milk && combo.milk !== 'none') ||
      (combo.extras || []).some(id => creamyExtras.has(id))) tags.push('creamy');
  if (flavors.some(name => tropical.has(name))) tags.push('tropical');
  if (combo.drink === 'mocha' || flavors.some(name => containsPhrase(name, 'chocolate')) ||
      (combo.extras || []).some(id => ['chocolate', 'whitechoc'].includes(id))) tags.push('chocolate');
  if (flavors.some(name => flavorByName.get(name)?.family === 'seasonal')) tags.push('seasonal');
  return tags;
}

function searchable(recipe) {
  const combo = getCombo(recipe), base = DRINK[combo.drink];
  return normalized([
    recipe.name, recipe.slug, recipe.blurb, base?.name, base?.desc, base?.cat,
    combo.temp === 'frozen' ? 'frozen chiller blended' : combo.temp,
    combo.milk, ...(combo.flavors || []), ...tasteTags(combo),
  ].filter(Boolean).join(' '));
}

function exclusions(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map(normalized).filter(Boolean);
}

function ingredientText(recipe) {
  const combo = getCombo(recipe), base = DRINK[combo.drink];
  return normalized([
    base?.desc, combo.milk === 'none' ? '' : combo.milk,
    ...(combo.flavors || []), ...(combo.extras || []).map(id => EXTRA[id]?.label),
  ].filter(Boolean).join(' '));
}

function eligible(recipe, { category = 'any', temp = 'any', taste = 'any' }, excluded) {
  const combo = getCombo(recipe), base = DRINK[combo.drink];
  if (!base) return false;
  if (categories.has(category) && base.cat !== category) return false;
  if (['hot', 'iced', 'frozen'].includes(temp) && combo.temp !== temp) return false;
  if (taste && !['any', 'all'].includes(taste) && !tasteTags(combo).includes(taste)) return false;
  const ingredients = ingredientText(recipe);
  return !excluded.some(name => containsPhrase(ingredients, name));
}

function relevance(recipe, queryTokens) {
  const combo = getCombo(recipe), text = searchable(recipe);
  const name = normalized(recipe.name), flavorText = normalized((combo.flavors || []).join(' '));
  const baseName = normalized(DRINK[combo.drink]?.name);
  return queryTokens.reduce((score, token) => score +
    (containsPhrase(name, token) ? 5 : 0) +
    (containsPhrase(flavorText, token) ? 4 : 0) +
    (containsPhrase(baseName, token) ? 3 : 0) +
    (containsPhrase(text, token) ? 1 : 0), 0);
}

/**
 * Filter catalog recipes without changing them or their order.
 * query: diacritic-insensitive, all search words must match (partial words allowed).
 * category: any/coffee/energy/tea/nocaf; temp: any/hot/iced/frozen.
 * taste: any/fruity/creamy/tropical/chocolate/seasonal.
 * exclude: ingredient names as an array or comma-separated string; no allergy guarantee.
 * sort: featured (source order), name (A–Z), or relevance (stable ties).
 */
export function searchCombos(list, {
  query = '', category = 'any', temp = 'any', taste = 'any', exclude = [], sort = 'featured',
} = {}) {
  const tokens = words(query), excluded = exclusions(exclude);
  const matches = list.filter(recipe => eligible(recipe, { category, temp, taste }, excluded) &&
    tokens.every(token => searchable(recipe).includes(token)));
  if (sort === 'name') matches.sort((a, b) => {
    const left = normalized(a.name || DRINK[getCombo(a).drink]?.name);
    const right = normalized(b.name || DRINK[getCombo(b).drink]?.name);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (sort === 'relevance') matches.sort((a, b) => relevance(b, tokens) - relevance(a, tokens));
  return matches;
}

const stopWords = new Set(['a', 'an', 'and', 'as', 'at', 'be', 'drink', 'drinks', 'for', 'get', 'i', 'in',
  'is', 'it', 'like', 'me', 'my', 'of', 'on', 'or', 'please', 'some', 'something', 'the', 'to', 'want', 'with']);
const tasteHints = {
  fruity: ['fruit', 'fruity', 'berry', 'berries'],
  creamy: ['cream', 'creamy', 'dessert', 'smooth'],
  tropical: ['tropical', 'beach', 'island', 'summer'],
  chocolate: ['chocolate', 'chocolaty', 'chocolatey', 'cocoa'],
  seasonal: ['seasonal', 'autumn', 'fall', 'winter', 'holiday', 'festive'],
};

/** Deterministic catalog fallback. Matches rank first; source order breaks ties. */
export function recommendCombos(list, { query = '', kind = 'any', exclude = [], limit = 3 } = {}) {
  const count = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 3;
  if (!count) return [];
  const queryTokens = words(query).filter(token => !stopWords.has(token));
  const hints = Object.entries(tasteHints).filter(([, terms]) => terms.some(term => queryTokens.includes(term)))
    .map(([tag]) => tag);
  return searchCombos(list, { category: kind, exclude }).map((recipe, index) => ({
    recipe, index,
    score: relevance(recipe, queryTokens) + tasteTags(recipe).filter(tag => hints.includes(tag)).length * 8,
  })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count).map(item => item.recipe);
}
