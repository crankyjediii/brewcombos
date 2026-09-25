// Applies the visitor's saved settings (size, milk, sugar-free) to the generated pages.
// The HTML always holds the standard recipe (that's what search engines index); this redraws it in the browser.
//   #combo-data  on a drink page: the order box, "What's in it", "Other ways to order it", the cup size
//   [data-q]     on any list: an order line (or with data-show="base", the "Medium iced 7 Energy" label)
import * as M from '/lib/menu.js';
import { factsHTML, variationsHTML, esc } from '/lib/layout.js';
import { getSettings, onSettings } from '/assets/settings.js';

const dataEl = document.getElementById('combo-data');
let data = null;
try { data = dataEl && JSON.parse(dataEl.textContent) } catch { /* no drink data on this page */ }
let showStandard = false;

const prefsOf = s => ({ size: s.size, milk: s.milk, sf: s.sf || undefined });

function lists(prefs) {
  document.querySelectorAll('[data-q]').forEach(el => {
    const o = M.comboFromQuery(el.dataset.q);
    if (!o) return;
    const mine = M.applyPrefs(o, prefs);
    el.textContent = el.dataset.show === 'base' ? M.baseLabel(mine) + (el.dataset.suffix || '') : M.orderLine(mine);
  });
}

// What the settings changed, in words: "large, oat milk, sugar-free"
function differences(std, mine) {
  const out = [];
  if (mine.size !== std.size) out.push(mine.size);
  if (mine.milk !== std.milk) out.push(`${(M.MILKS[M.DRINK[mine.drink].milk].find(m => m[0] === mine.milk) || [, mine.milk])[1].toLowerCase()} milk`);
  if (mine.sf && !std.sf) out.push('sugar-free');
  return out;
}

function drink(prefs) {
  if (!data) return;
  const std = M.fixCombo(data.combo);
  const mine = M.applyPrefs(std, prefs);
  const changes = differences(std, mine);
  const o = changes.length && !showStandard ? mine : std;
  const line = M.orderLine(o);

  const say = document.getElementById('order');
  say.querySelector('.line').textContent = line;
  say.querySelector('[data-say]').dataset.say = line;
  say.querySelector('a.btn').href = `/?${M.comboToQuery(o)}#build`;
  // Share their version when it differs; the drink page itself shows the standard recipe
  const share = say.querySelector('[data-share]');
  const q = `${M.comboToQuery(o)}&n=${encodeURIComponent(data.name)}`;
  share.dataset.share = o === std ? `/drinks/${data.slug}` : `/s?${q}`;
  share.dataset.text = line;
  share.dataset.card = `${location.origin}/card.png?${q}`;
  share.dataset.story = `${share.dataset.card}&format=story`;

  document.getElementById('facts').innerHTML = factsHTML(o);
  document.getElementById('variations').innerHTML = variationsHTML(o);
  document.querySelector('.drink-hero .cup .body')?.style.setProperty('--s', { small: .8, medium: .9, large: 1 }[o.size]);

  const note = document.getElementById('prefs-note');
  note.hidden = !changes.length;
  if (!changes.length) return;
  note.innerHTML = showStandard
    ? `<span>Showing the standard recipe.</span><button class="text-btn" type="button" data-toggle>Use my settings</button>`
    : `<span>Adjusted to your settings: ${esc(changes.join(', '))}.</span><button class="text-btn" type="button" data-toggle>Show the standard recipe</button><button class="text-btn" type="button" data-settings>Change settings</button>`;
}

function run() {
  const prefs = prefsOf(getSettings());
  lists(prefs);
  drink(prefs);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#prefs-note [data-toggle]')) return;
  showStandard = !showStandard;
  run();
  document.querySelector('#prefs-note [data-toggle]')?.focus();
});
onSettings((s, key) => { if (['size', 'milk', 'sf'].includes(key)) run() });
run();
