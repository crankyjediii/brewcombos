// Settings: saved on this device (localStorage), applied on every page.
// The theme and motion settings are also applied by a tiny inline script in each page's <head>,
// so the page never flashes the wrong theme before this file loads.

const KEY = 'bc_settings';
export const DEFAULTS = { theme: 'system', motion: 'system', size: 'drink', milk: 'drink', sf: false, kind: 'any' };

const OPTIONS = {
  theme: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']],
  motion: [['system', 'System'], ['reduce', 'Reduced']],
  size: [['drink', 'Per drink'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
  milk: [['drink', 'Per drink'], ['whole', 'Whole'], ['skim', 'Skim'], ['oat', 'Oat'], ['almond', 'Almond'], ['coconut', 'Coconut']],
  kind: [['any', 'Any'], ['coffee', 'Coffee'], ['energy', 'Energy'], ['nocaf', 'No caffeine']],
};

let settings = load();
const listeners = new Set();

function load() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    for (const k of Object.keys(OPTIONS)) if (!OPTIONS[k].some(o => o[0] === s[k])) s[k] = DEFAULTS[k];
    s.sf = s.sf === true;
    return s;
  } catch { return { ...DEFAULTS } }
}

export const getSettings = () => ({ ...settings });
export const onSettings = fn => { listeners.add(fn); return () => listeners.delete(fn) };
export const reducedMotion = () => settings.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setSetting(k, v) {
  settings = { ...settings, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {}
  apply();
  listeners.forEach(fn => fn(getSettings(), k));
}

function apply() {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
  if (settings.motion === 'reduce') root.dataset.motion = 'reduce'; else delete root.dataset.motion;
  // Match the browser bar to the chosen theme
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.removeAttribute('media');
    m.content = dark ? '#15241f' : '#f8f8f2';
  });
}

/* ---------- The panel ---------- */

let dialog;
const seg = (k, label) => `
  <div class="setting">
    <p class="label" id="set-${k}">${label}</p>
    <div class="seg" role="group" aria-labelledby="set-${k}">${OPTIONS[k].map(([v, l]) =>
      `<button type="button" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>
  </div>`;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'sheet settings-sheet';
  dialog.setAttribute('aria-labelledby', 'settings-h');
  dialog.innerHTML = `
    <form method="dialog" class="sheet-head">
      <h2 id="settings-h">Settings</h2>
      <button class="icon-btn" value="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </form>
    <section aria-labelledby="set-look">
      <h3 id="set-look">Look and feel</h3>
      ${seg('theme', 'Appearance')}
      ${seg('motion', 'Animations')}
      <p class="setting-note">Reduced turns off the pouring, waves and other movement. System follows your device.</p>
    </section>
    <section aria-labelledby="set-order">
      <h3 id="set-order">Your usual order</h3>
      ${seg('size', 'Size')}
      ${seg('milk', 'Milk')}
      <p class="setting-note">Used in the builder and on AI drinks. Milk only changes drinks that come with a choice; a breve is always half &amp; half.</p>
      <label class="check"><input type="checkbox" data-k="sf"><span class="box"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg></span>
        <span>Request sugar-free syrups<small>Availability varies. Bases, milk and toppings can still contain sugar.</small></span></label>
      ${seg('kind', 'Drink type for vibes')}
    </section>
    <section aria-labelledby="set-data">
      <h3 id="set-data">Saved on this device</h3>
      <div class="setting-actions">
        <button class="btn quiet" type="button" data-act="flavors">Clear my added flavors</button>
        <button class="btn quiet" type="button" data-act="reset">Reset settings</button>
      </div>
      <p class="setting-note" aria-live="polite" data-note></p>
    </section>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('pointerdown', e => { if (e.target === dialog) dialog.close() });
  dialog.addEventListener('click', e => {
    const b = e.target.closest('[data-k][data-v]');
    if (b) { setSetting(b.dataset.k, b.dataset.v); sync(); return }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const note = dialog.querySelector('[data-note]');
    if (a.dataset.act === 'flavors') {
      try { localStorage.removeItem('tp_custom') } catch {}
      note.textContent = 'Your added flavors are cleared. Reload the page to see the change.';
      listeners.forEach(fn => fn(getSettings(), 'flavors'));
    }
    if (a.dataset.act === 'reset') {
      for (const [k, v] of Object.entries(DEFAULTS)) setSetting(k, v);
      sync();
      note.textContent = 'Settings are back to the defaults.';
    }
  });
  dialog.querySelector('input[data-k="sf"]').addEventListener('change', e => setSetting('sf', e.target.checked));
}

function sync() {
  dialog.querySelectorAll('[data-k][data-v]').forEach(b => b.setAttribute('aria-pressed', String(settings[b.dataset.k] === b.dataset.v)));
  dialog.querySelector('input[data-k="sf"]').checked = settings.sf;
}

export function openSettings() {
  if (!dialog) build();
  dialog.querySelector('[data-note]').textContent = '';
  sync();
  dialog.showModal();
}

apply();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
document.addEventListener('click', e => { if (e.target.closest('[data-settings]')) openSettings() });
