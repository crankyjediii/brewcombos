import { saveLocal, isSaved, notify, showOrder } from '/assets/library.js';
import { COMBOS } from '/lib/drinks.js';
import { recommendCombos } from '/lib/discovery.js';

import * as M from '/lib/menu.js';
import { cupSVG, cupLook } from '/lib/cup.js';
import { drinkOfTheDay } from '/lib/daily.js';
import { getSettings, onSettings, reducedMotion } from '/assets/settings.js';
import { openShare } from '/assets/share.js';

const reduce = () => reducedMotion();   // follows the device setting and the Animations setting
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, f){ try{ const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v) }catch{ return f } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} },
};
const rand = a => a[Math.floor(Math.random() * a.length)];

let custom = M.cleanCustom(store.get('tp_custom', []));
const flavorList = () => M.allFlavors(custom);
const colorOf = n => M.flavorColor(n, custom);

/* Readable text color on a flavor swatch */
function textOn(c){
  if(!c.startsWith('#')) return '#221610';
  const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299*r + 0.587*g + 0.114*b) / 255 > .62 ? '#221610' : '#FFFFFF';
}
const swatches = flavors => `<ul class="flavors-inline">${flavors.map(f =>
  `<li><span class="sw" style="--c:${colorOf(f)}"></span>${esc(f)}</li>`).join('')}</ul>`;

/* ================= The cup ================= */
let cupN = 0;
function createCup(){
  const n = ++cupN;
  const el = document.createElement('div'); el.className = 'cup';
  el.innerHTML = cupSVG(n);
  const body = el.querySelector('.body');
  const stops = [...el.querySelectorAll('stop')], level = el.querySelector('.level');
  const straw = el.querySelector('.straw'), drop = el.querySelector('.drop');
  let prevFlavors = [];

  function update(o, { quiet = false } = {}){
    const look = cupLook(o, colorOf);
    stops.forEach((st, i) => st.style.stopColor = look.stops[i]);
    Object.entries(look.classes).forEach(([k, v]) => body.classList.toggle(k, v));
    body.style.setProperty('--drizzle', look.drizzle);
    body.style.setProperty('--s', look.scale);
    straw.style.fill = look.straw;

    const added = o.flavors.filter(f => !prevFlavors.includes(f));
    prevFlavors = [...o.flavors];
    if(added.length && !quiet) pour(colorOf(added[added.length-1]));
  }
  function pour(color){
    if(reduce()) return;
    drop.style.fill = color;
    drop.animate([
      {transform:'translateY(0) scale(1,1.2)', opacity:1},
      {transform:'translateY(110px) scale(.9,1.35)', opacity:1, offset:.8},
      {transform:'translateY(118px) scale(1.6,.3)', opacity:0},
    ], {duration:480, easing:'cubic-bezier(.5,0,.9,.6)'}).onfinish = () => {
      level.classList.remove('slosh'); void level.offsetWidth; level.classList.add('slosh');
    };
  }
  return {el, update};
}

/* ================= Tabs ================= */
const tabs = [$('#tab-vibe'), $('#tab-build')];
const bar = $('.tabs .bar');
function placeBar(){
  const b = tabs.find(t => t.getAttribute('aria-selected') === 'true');
  bar.style.width = b.offsetWidth + 'px';
  bar.style.transform = `translateX(${b.offsetLeft}px)`;
}
function showTab(which, { focus = false } = {}){
  const vibe = which === 'vibe';
  $('#tools-heading').textContent = vibe ? 'Made to your mood.' : 'A drink, your way.';
  tabs.forEach(t => {
    const on = (t.id === 'tab-vibe') === vibe;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  });
  const show = vibe ? $('#panel-vibe') : $('#panel-build');
  const hide = vibe ? $('#panel-build') : $('#panel-vibe');
  if(!show.hidden) return placeBar();
  hide.hidden = true; show.hidden = false;
  show.classList.remove('enter'); void show.offsetWidth; show.classList.add('enter');
  placeBar();
  if(focus) tabs[vibe ? 0 : 1].focus();
  if(!vibe) render();
  history.replaceState(null, '', vibe ? '#vibe' : '#build');
}
tabs[0].onclick = () => showTab('vibe');
tabs[1].onclick = () => showTab('build');
$('.tabs').addEventListener('keydown', e => {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  e.preventDefault();
  const onVibe = tabs[0].getAttribute('aria-selected') === 'true';
  const next = e.key === 'Home' ? 'vibe' : e.key === 'End' ? 'build' : onVibe ? 'build' : 'vibe';
  showTab(next, { focus:true });
});
document.fonts?.ready.then(placeBar);
addEventListener('resize', placeBar);
placeBar();

/* Share a drink: opens the share panel with a preview image of this exact drink.
   /s?... is the page the link opens; /card.png draws the preview and the story image. */
function shareDrink(o, name, { page, label } = {}){
  const q = `${M.comboToQuery(o)}${name ? `&n=${encodeURIComponent(name)}` : ''}`;
  const title = M.comboTitle(o, name);
  openShare({
    url: page || `/s?${q}`, title, text: M.orderLine(o),
    card: `/card.png?${q}`, story: `/card.png?${q}&format=story${label ? `&l=${label}` : ''}`,
    filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`,
  });
}

async function copyText(text, btn, label = 'Copy your order:'){
  let ok = true;
  try{ await navigator.clipboard.writeText(text) }
  catch{
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select();
    try{ ok = document.execCommand('copy') }catch{ ok = false } t.remove();
  }
  if(!ok){ prompt(label, text); return }
  btn.classList.add('done');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.classList.remove('done'), 1600);
}

/* ================= Builder ================= */
let prefs = getSettings();
let state = M.comboFromQuery(store.get('bc_draft', '')) || M.applyPrefs(M.fixCombo({drink:'breve', temp:'iced', size:'medium', milk:'', flavors:[], extras:[], sweet:'regular', sf:false}), prefs);
custom = M.cleanCustom([...new Set([...custom, ...state.flavors.filter(f => !M.FLAVORS.some(x => x.name === f))])]);
const ticketCup = createCup();
$('#ticket-cup').appendChild(ticketCup.el);

function seg(el, items, onPick){
  el.innerHTML = items.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if(b && !b.disabled) onPick(b.dataset.v) };
}
function syncSeg(el, current, disabled = []){
  el.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.v === current);
    b.disabled = disabled.includes(b.dataset.v);
  });
}

$('#drinks').innerHTML = M.DRINKS.map(d =>
  `<button type="button" class="drink" data-id="${d.id}" style="--c:${d.color}"><b>${d.name}</b><span>${d.desc}</span></button>`).join('');
$('#drinks').onclick = e => {
  const b = e.target.closest('.drink'); if(!b || b.dataset.id === state.drink) return;
  // New drink, new milk options: start from their saved milk preference
  state = M.applyPrefs({ ...state, drink: b.dataset.id, milk: '' }, { milk: prefs.milk });
  render();
};
seg($('#temps'), Object.entries(M.TEMP_LABELS), v => { state.temp = v; render() });
seg($('#sweets'), M.SWEETS.map(([v, l]) => [v, l]), v => { state.sweet = v; render() });
$('#sweets').querySelectorAll('button').forEach(b => {
  const words = M.SWEETS.find(w => w[0] === b.dataset.v)[2];
  if(words) b.setAttribute('aria-label', words);
});
seg($('#sizes'), M.SIZES.map(s => [s, s[0].toUpperCase() + s.slice(1)]), v => { state.size = v; render() });

let milkType = null, extrasKey = '';
function buildFlavors(){
  const fl = flavorList();
  $('#flavors').innerHTML = Object.entries(M.FAMILIES).map(([fam, label]) => {
    const items = fl.filter(f => f.family === fam);
    if(!items.length) return '';
    return `<div class="fam" role="group" aria-label="${label} flavors"><p class="label">${label}</p><div class="chips">${items.map(f => {
      const chip = `<button type="button" class="chip" data-f="${esc(f.name)}" style="--c:${f.color};--on:${textOn(f.color)}"><span class="sw"></span>${esc(f.name)}</button>`;
      return fam === 'yours'
        ? `<span class="mine">${chip}<button type="button" class="rm" data-rm="${esc(f.name)}" aria-label="Remove ${esc(f.name)}">×</button></span>`
        : chip;
    }).join('')}</div></div>`;
  }).join('');
}
buildFlavors();

function setScript(el, text){
  const prev = new Set((el.dataset.prev || '').split(' '));
  el.innerHTML = text.split(' ').map((w, i) =>
    `<span class="w${prev.has(w) ? '' : ' fresh'}" style="--i:${i}">${esc(w)}</span>`).join(' ');
  el.dataset.prev = text;
}

function render(){
  state = M.fixCombo(state);
  const d = M.DRINK[state.drink];

  document.querySelectorAll('.drink').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === state.drink));
  syncSeg($('#temps'), state.temp, ['hot','iced','frozen'].filter(t => !d.temps.includes(t)));
  syncSeg($('#sizes'), state.size);
  syncSeg($('#sweets'), state.sweet);

  if(milkType !== d.milk){
    milkType = d.milk;
    const list = M.MILKS[d.milk];
    $('#milk-wrap').hidden = !list;
    if(list) seg($('#milks'), list, v => { state.milk = v; render() });
  }
  if(M.MILKS[d.milk]) syncSeg($('#milks'), state.milk);

  document.querySelectorAll('#flavors .chip').forEach(c => c.setAttribute('aria-pressed', state.flavors.includes(c.dataset.f)));
  const n = state.flavors.length;
  $('#count').textContent = n ? `${n} picked · up to 6` : 'Start with 1–3 flavors';

  const avail = M.EXTRAS.filter(e => e.ok(d, state.temp));
  const key = avail.map(e => e.id).join();
  if(key !== extrasKey){
    extrasKey = key;
    $('#extras').innerHTML = avail.map(e => `<button type="button" class="chip" data-e="${e.id}">${e.label}</button>`).join('');
  }
  document.querySelectorAll('#extras [data-e]').forEach(b => b.setAttribute('aria-pressed', state.extras.includes(b.dataset.e)));
  $('#sf').checked = state.sf;

  setScript($('#script'), M.orderLine(state));
  $('#warn').hidden = n <= 3;

  const rows = [['Drink', M.baseLabel(state)]];
  if(d.milk === 'fixed') rows.push(['Milk', 'Half & half']);
  rows.push(['Flavors', n ? state.flavors.join(', ') : 'None yet']);
  if(state.extras.length) rows.push(['Extras', state.extras.map(id => M.EXTRA[id].label).join(', ')]);
  if(state.sweet !== 'regular') rows.push(['Sweetness', M.SWEETS.find(w => w[0] === state.sweet)[2]]);
  if(state.sf) rows.push(['Syrups', 'Sugar-free']);
  $('#details').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');

  ticketCup.update(state);
  store.set('bc_draft', M.comboToQuery(state));
  $('#save-build').textContent = isSaved(state) ? 'Saved to my drinks' : 'Save drink';
}

$('#flavors').onclick = e => {
  const rm = e.target.closest('[data-rm]');
  if(rm){
    const name = rm.dataset.rm;
    custom = custom.filter(c => c !== name); store.set('tp_custom', custom);
    state.flavors = state.flavors.filter(f => f !== name);
    buildFlavors(); render();
    $('#custom-flavor').focus();
    return;
  }
  const b = e.target.closest('.chip'); if(!b) return;
  const name = b.dataset.f, on = !state.flavors.includes(name);
  if(on && state.flavors.length >= M.MAX_FLAVORS){ notify('Keep your drink to six flavors so it is easy to order.'); return }
  state.flavors = on ? [...state.flavors, name] : state.flavors.filter(f => f !== name);
  if(on){ b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop') }
  render();
};
$('#extras').onclick = e => {
  const b = e.target.closest('[data-e]'); if(!b) return;
  const id = b.dataset.e;
  state.extras = state.extras.includes(id) ? state.extras.filter(x => x !== id) : [...state.extras, id];
  render();
};
$('#sf').onchange = e => { state.sf = e.target.checked; render() };
$('#save-build').onclick = () => saveLocal({name: M.comboTitle(state), combo:state});
$('#window-build').onclick = () => showOrder({name: M.comboTitle(state), combo:state});
$('#submit-build').onclick = () => { sessionStorage.setItem('bc_submission', JSON.stringify(state)); location.hash = 'community'; };
$('#copy').onclick = e => copyText(M.orderLine(state), e.currentTarget);
$('#share').onclick = () => shareDrink(state, '');
$('#clear').onclick = () => { state.flavors = []; state.extras = []; state.sf = false; state.sweet = 'regular'; render() };

$('#add-form').onsubmit = e => {
  e.preventDefault();
  const inp = $('#custom-flavor'), note = $('#add-note');
  note.textContent = '';
  const raw = M.cleanCustom([inp.value])[0];
  if(!raw){ inp.value = ''; return }
  const title = raw.replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
  let match = flavorList().find(f => f.name.toLowerCase() === title.toLowerCase());
  if(!match){
    if(custom.length >= 12){ note.textContent = 'You can save up to 12 of your own. Remove one to add another.'; return }
    custom.push(title); store.set('tp_custom', custom); buildFlavors();
    match = flavorList().find(f => f.name === title);
  }
  if(!state.flavors.includes(match.name) && state.flavors.length < M.MAX_FLAVORS) state.flavors.push(match.name);
  inp.value = ''; render();
};

/* Surprise me: a short shuffle that slows down, then lands on a sensible combo */
function randomCombo(){
  const d = rand(M.DRINKS);
  const fruity = d.tinted || d.id === 'smoothie';
  const pool = flavorList().filter(f => fruity ? f.family === 'fruit' : ['classic','dessert'].includes(f.family));
  const n = 1 + Math.floor(Math.random() * 2) + (Math.random() > .7 ? 1 : 0);
  const flavors = [];
  while(flavors.length < n){ const f = rand(pool).name; if(!flavors.includes(f)) flavors.push(f) }
  const temp = rand(d.temps);
  const extras = M.EXTRAS.filter(e => e.ok(d, temp) && Math.random() > .75).map(e => e.id).slice(0, 2);
  return M.applyPrefs({drink:d.id, temp, size:rand(M.SIZES), milk:rand((M.MILKS[d.milk] || [['']]).map(m => m[0])), flavors, extras, sf:false}, prefs);
}
let spinning = false;
$('#surprise').onclick = () => {
  if(spinning) return;
  if(reduce()){ state = randomCombo(); render(); return }
  spinning = true;
  let tick = 0;
  (function step(){
    state = randomCombo(); render();
    if(++tick < 7) setTimeout(step, 60 + tick * tick * 6);
    else spinning = false;
  })();
};

/* ================= Vibe ================= */
const EXAMPLES = [
  "Friday night football, it's cold, we won",
  'tastes like a sunset at the lake',
  'Halloween but no pumpkin',
  'need energy, hate coffee',
  'rainy day, studying for a math test',
];
const ta = $('#vibe-input');
$('#examples').insertAdjacentHTML('beforeend', EXAMPLES.map(x => `<li><button type="button">${esc(x)}</button></li>`).join(''));
$('#examples').onclick = e => {
  const b = e.target.closest('button'); if(!b) return;
  ta.value = b.textContent; grow(); ta.focus();
  setStatus('');
};

function grow(){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
  ta.style.overflowY = ta.scrollHeight > ta.clientHeight + 2 ? 'auto' : 'hidden';
  const left = 280 - ta.value.length, c = $('#counter');
  c.textContent = `${left} left`;
  c.classList.toggle('show', left <= 60);
  c.classList.toggle('near', left <= 20);
}
ta.addEventListener('input', () => { grow(); if($('#status').classList.contains('err')) setStatus('') });
ta.placeholder = 'a mood, a song, the day you’re having…';

let kind = prefs.kind;
$('#vibe-sf').checked = prefs.sf;
seg($('#kind'), M.KINDS, v => { kind = v; syncSeg($('#kind'), kind) });
syncSeg($('#kind'), kind);

function setStatus(text, err = false){
  const s = $('#status');
  s.textContent = text;
  s.classList.toggle('err', err);
}

let lastCombos = [], lastVibe = '', inflight = null;
const results = $('#results');

function head(title, vibe, { busy = false, again = true } = {}){
  return `<div class="results-head"><h2>${title} for <q>${esc(vibe)}</q></h2>
    ${again ? `<button class="again" type="button" data-again ${busy ? 'disabled' : ''}>Mix again</button>` : ''}</div>`;
}

function showLoading(vibe){
  results.setAttribute('aria-busy', 'true');
  results.innerHTML = head('Mixing', vibe, { busy:true });
  const cups = [];
  for(let i = 0; i < 3; i++){
    const row = document.createElement('article');
    row.className = 'result loading'; row.style.setProperty('--i', i); row.setAttribute('aria-hidden', 'true');
    const cup = createCup(); cups.push(cup);
    row.appendChild(cup.el);
    row.insertAdjacentHTML('beforeend', `<div><div class="ph" style="width:60%;height:28px;margin-top:6px"></div><div class="ph" style="width:40%"></div><div class="ph" style="width:75%;margin-top:22px"></div><div class="ph" style="width:55%"></div></div><div class="say"></div>`);
    results.appendChild(row);
  }
  const shuffle = () => cups.forEach(c => c.update(randomCombo(), { quiet:true }));
  shuffle();
  const started = Date.now();
  const timer = setInterval(() => {
    shuffle();
    const s = (Date.now() - started) / 1000;
    if(s > 25) setStatus('Still going. The AI is busy right now; this can take up to a minute.');
    else if(s > 10) setStatus('Taking longer than usual…');
  }, 1100);
  return () => { clearInterval(timer); results.setAttribute('aria-busy', 'false') };
}

function renderResults(vibe, combos){
  lastCombos = combos;
  results.innerHTML = head(['One drink', 'Two drinks', 'Three drinks'][combos.length - 1], vibe);
  combos.forEach((o, i) => {
    const row = document.createElement('article');
    row.className = 'result'; row.style.setProperty('--i', i);
    row.setAttribute('aria-labelledby', `r${i}`);
    const cup = createCup();
    row.appendChild(cup.el);
    row.insertAdjacentHTML('beforeend', `
      <div>
        <h3 id="r${i}">${esc(o.name)}</h3>
        <p class="base">${esc(M.baseLabel(o))}${o.sf ? ' · sugar-free' : ''}</p>
        ${swatches(o.flavors)}
        ${o.why ? `<p class="why">${esc(o.why)}</p>` : ''}
      </div>
      <div class="say">
        <p class="label">Say this at the window</p>
        <p class="line">${esc(M.orderLine(o))}</p>
        <div class="actions">
          <button class="btn" data-copy="${i}" type="button"><span class="idle">Copy order</span><span class="ok">Copied</span></button>
          <button class="btn quiet" data-save-result="${i}" type="button">Save drink</button>
          <button class="btn quiet" data-edit="${i}" type="button">Tweak it</button>
          <button class="btn quiet" data-share="${i}" type="button"><span class="idle">Share</span><span class="ok">Link copied</span></button>
        </div>
      </div>`);
    results.appendChild(row);
    cup.update({...o, flavors:[]}, { quiet:true });
    setTimeout(() => cup.update(o), reduce() ? 0 : 300 + i * 160);
  });
}

function renderProblem(vibe, message){
  results.innerHTML = head('No drinks yet', vibe, { again:false }) + `
    <div class="problem" role="alert">
      <p><strong>That one didn't pour.</strong>${esc(message)}</p>
      <button class="btn" type="button" data-again>Try again</button>
    </div>`;
}

results.onclick = e => {
  const save = e.target.closest('[data-save-result]');
  if(save){ const o=lastCombos[+save.dataset.saveResult]; saveLocal({name:o.name,combo:o}); save.textContent='Saved'; return; }
  const c = e.target.closest('[data-copy]'), ed = e.target.closest('[data-edit]'), sh = e.target.closest('[data-share]');
  if(sh){ const o = lastCombos[+sh.dataset.share]; shareDrink(o, o.name) }
  if(e.target.closest('[data-again]')){ mix(lastVibe); return }
  if(c){ copyText(M.orderLine(lastCombos[+c.dataset.copy]), c) }
  if(ed){
    state = M.fixCombo(lastCombos[+ed.dataset.edit]);
    showTab('build');
    scrollTo({top:0, behavior: reduce() ? 'auto' : 'smooth'});
  }
};

async function mix(vibe){
  if(inflight) return;
  const btn = $('#go');
  if(!vibe){
    setStatus('Type a vibe first, or pick one of the examples.', true);
    ta.focus(); return;
  }
  lastVibe = vibe;
  btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Mixing…';
  const stop = showLoading(vibe);
  const ctrl = new AbortController();
  inflight = ctrl;
  const giveUp = setTimeout(() => ctrl.abort(), 65_000);
  if(innerWidth < 900) results.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block:'start' });
  try{
    const r = await fetch('/api/mix', {
      method:'POST', headers:{'Content-Type':'application/json'}, signal: ctrl.signal,
      body: JSON.stringify({vibe, kind, sf: $('#vibe-sf').checked, custom}),
    });
    const j = await r.json().catch(() => ({}));
    if(!r.ok || !Array.isArray(j.combos) || !j.combos.length) throw new Error(j.error || 'Something went wrong on our end. Give it another try.');
    stop(); setStatus('');
    // Saved size / milk / sugar-free preferences apply to AI drinks too
    renderResults(vibe, j.combos.map(c => ({ ...M.applyPrefs(M.fixCombo(c), {...prefs,sf:$('#vibe-sf').checked}), name:c.name, why:c.why })));
  }catch(err){
    stop();
    const msg = err.name === 'AbortError' ? 'The AI took too long to answer. It usually works on a second try.'
      : err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again."
      : /OpenRouter|settings/i.test(err.message) ? 'The mixer is unavailable right now.' : err.message;
    setStatus('');
    const picks = recommendCombos(COMBOS, {query:vibe, kind, limit:3});
    renderResults(vibe, picks.map(c => ({...M.applyPrefs(M.fixCombo({...c.combo, sf:$('#vibe-sf').checked}), {...prefs, sf:$('#vibe-sf').checked}), name:c.name, why:c.blurb})));
    setStatus(`${msg} Here are picks from our recipe book instead.`);
    results.querySelector('h2').textContent = 'Picks from the recipe book';
  }finally{
    clearTimeout(giveUp); inflight = null;
    btn.removeAttribute('aria-busy'); btn.textContent = 'Mix three drinks';
  }
}
$('#ask').onsubmit = e => { e.preventDefault(); mix(ta.value.replace(/\s+/g, ' ').trim()) };
ta.onkeydown = e => {
  if(e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)){ e.preventDefault(); $('#ask').requestSubmit() }
};

render();
grow();
document.fonts?.ready.then(grow);
addEventListener('resize', grow);
// "Tweak it" links from drink pages (and shared links) carry the drink in the query string.
const linked = M.comboFromQuery(location.search, custom);
if(linked){
  state = linked;
  custom = M.cleanCustom([...new Set([...custom, ...linked.flavors.filter(f => !M.FLAVORS.some(x => x.name === f))])]);
  store.set('tp_custom', custom); buildFlavors();
  history.replaceState(null, '', '/#build');
}
if(linked || location.hash === '#build') showTab('build');

/* Settings changed in the panel: update what's on screen */
onSettings((next, key) => {
  prefs = next;
  if(key === 'size' || key === 'milk' || key === 'sf'){ state = M.applyPrefs(state, { [key]: next[key] }); render() }
  if(key === 'sf') $('#vibe-sf').checked = next.sf;
  if(key === 'kind'){ kind = next.kind; syncSeg($('#kind'), kind) }
  if(key === 'flavors'){ custom = []; state.flavors = state.flavors.filter(f => M.FLAVORS.some(x => x.name === f)); buildFlavors(); render() }
});

addEventListener('hashchange', () => { if(['#build','#vibe'].includes(location.hash)) showTab(location.hash.slice(1)); });
addEventListener('bc:library', () => { $('#save-build').textContent = isSaved(state) ? 'Saved to my drinks' : 'Save drink'; });
