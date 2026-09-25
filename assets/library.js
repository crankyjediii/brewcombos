import * as M from '/lib/menu.js';
import { esc } from '/lib/layout.js';
import { getAccount, onAccount, saveDrink, deleteSaved, listSaved } from '/assets/account.js';

const KEY = 'bc_library_v1';
const MAX = 500;
let scope = KEY;
let removed = [];
const deletionKey = () => scope + '_removed';
export const comboKey = combo => M.comboToQuery(M.fixCombo({...combo, flavors:[...combo.flavors].sort(), extras:[...combo.extras].sort()}));
function clean(record) {
  if (!record || typeof record !== 'object' || !record.combo || !M.DRINK[record.combo.drink]) return null;
  try {
    const combo = M.comboFromQuery(M.comboToQuery(M.fixCombo(record.combo)));
    if (!combo) return null;
    return {id:comboKey(combo), name:M.cleanName(record.name) || M.comboTitle(combo), combo,
      status:record.status === 'tried' ? 'tried' : 'saved', rating:[1,2,3,4,5].includes(record.rating) ? record.rating : null,
      dirty:record.dirty === true, updated_at: typeof record.updated_at === 'string' && Number.isFinite(Date.parse(record.updated_at)) ? record.updated_at : new Date().toISOString()};
  } catch { return null; }
}
function read() {
  try { const rows = JSON.parse(localStorage.getItem(scope) || '[]'); return Array.isArray(rows) ? rows.slice(0,MAX).map(clean).filter(Boolean) : []; }
  catch { return []; }
}
let records = read();
let syncing = false;
let syncMessage = 'Saved on this device. Sign in to sync across devices.';
let lastUser = null;
let activeUser = null;
let syncJob = Promise.resolve();
export const getLibrary = () => records.map(r=>({...r,combo:{...r.combo,flavors:[...r.combo.flavors],extras:[...r.combo.extras]}}));
export const isSaved = combo => records.some(r => r.id === comboKey(combo));
export const getSyncStatus = () => syncMessage;
function emit(){ dispatchEvent(new CustomEvent('bc:library')); }
function persist(){
  try { localStorage.setItem(scope, JSON.stringify(records)); localStorage.setItem(deletionKey(), JSON.stringify(removed)); }
  catch { notify('Your browser could not save this drink. Keep this page open or copy the order.'); }
  emit();
}
export function notify(message) {
  let toast = document.getElementById('bc-toast');
  if(!toast){ toast = document.createElement('div'); toast.id='bc-toast'; toast.className='toast'; toast.setAttribute('role','status'); document.body.append(toast); }
  toast.textContent=message; toast.classList.add('visible'); clearTimeout(toast._timer); toast._timer=setTimeout(()=>toast.classList.remove('visible'),3500);
}
function queueSync(action) {
  const userId = getAccount().user?.id;
  if(!userId) return;
  syncJob = syncJob.then(async()=>{
    if(getAccount().user?.id !== userId) return;
    const stillCurrent=()=>getAccount().user?.id===userId;
    try { await action(stillCurrent); if(stillCurrent())syncMessage='Saved on this device and synced to your account.'; }
    catch { if(stillCurrent())syncMessage='Saved on this device. Account sync failed; refresh to retry.'; }
    if(stillCurrent())emit();
  });
}
export function saveLocal(record, {quiet=false}={}) {
  const item=clean({...record, dirty:true, updated_at:new Date().toISOString()});
  if(!item){notify('This drink could not be saved.'); return;}
  const existing=records.find(r=>r.id===item.id);
  if(existing){item.status=record.status || existing.status; item.rating=Object.hasOwn(record,'rating') ? record.rating : existing.rating;}
  if(item.rating) item.status='tried';
  if(item.status!=='tried')item.rating=null;
  if(!existing && records.length>=MAX){notify('Your collection holds up to 500 drinks. Remove one to add another.');return;}
  removed=removed.filter(id=>id!==item.id);
  records=[item,...records.filter(r=>r.id!==item.id)].slice(0,MAX); persist();
  queueSync(async stillCurrent=>{const cloud=await saveDrink(item);if(!stillCurrent())return;const index=records.findIndex(r=>r.id===item.id&&r.updated_at===item.updated_at);if(index>=0)records[index]=clean({...cloud,dirty:false});persist();});
  if(!quiet) notify('Saved to My drinks.');
  return item;
}
export function updateLocal(id,patch){const old=records.find(r=>r.id===id); if(old) return saveLocal({...old,...patch,...(patch.status==='saved'?{rating:null}:{})},{quiet:true});}
export function removeLocal(id){ records=records.filter(r=>r.id!==id);if(getAccount().user)removed=[...new Set([...removed,id])];persist();queueSync(async stillCurrent=>{await deleteSaved(id);if(!stillCurrent())return;removed=removed.filter(x=>x!==id);persist();});notify('Drink removed from My drinks.'); }
export function exportLibrary(){
  const blob=new Blob([JSON.stringify({version:1,drinks:records},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='brew-combos-my-drinks.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function syncAccount(account) {
  const userId=account.user?.id || null;
  if(userId!==activeUser){
    const guest=activeUser===null&&userId ? records : [];
    activeUser=userId;scope=userId?KEY+'_'+userId:KEY;
    records=read();
    try{const ids=JSON.parse(localStorage.getItem(deletionKey())||'[]');removed=Array.isArray(ids)?ids.filter(x=>typeof x==='string').slice(0,MAX):[];}catch{removed=[];}
    if(guest.length){
      const merged=new Map(records.map(r=>[r.id,r]));
      guest.forEach(r=>{if(!merged.has(r.id))merged.set(r.id,{...r,dirty:true});});
      records=[...merged.values()].slice(0,MAX);
      try{localStorage.removeItem(KEY);}catch{}
      persist();
    }
    lastUser=null;emit();
  }
  if(!userId){lastUser=null;syncMessage='Saved on this device. Sign in to sync across devices.';emit();return;}
  if(syncing || userId===lastUser) return;
  syncing=true;syncMessage='Syncing your drinks…';emit();
  try {
    const remote=await listSaved();
    if(getAccount().user?.id!==userId) return;
    // Only unsynced local changes are merged. Cloud deletions stay deleted.
    const merged=new Map(remote.map(clean).filter(Boolean).filter(r=>!removed.includes(r.id)).map(r=>[r.id,{...r,dirty:false}]));
    records.filter(r=>r.dirty).forEach(r=>merged.set(r.id,r));
    records=[...merged.values()].sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,MAX);persist();
    for(const id of [...removed]){
      if(getAccount().user?.id!==userId)return;
      await deleteSaved(id);if(getAccount().user?.id!==userId)return;removed=removed.filter(x=>x!==id);persist();
    }
    for(const r of records.filter(r=>r.dirty)){
      if(getAccount().user?.id!==userId) return;
      const cloud=await saveDrink(r);
      if(getAccount().user?.id!==userId) return;
      const index=records.findIndex(x=>x.id===r.id&&x.updated_at===r.updated_at);
      if(index>=0)records[index]=clean({...cloud,dirty:false});
      persist();
    }
    lastUser=userId;syncMessage='Saved on this device and synced to your account.';
  } catch {if(getAccount().user?.id===userId)syncMessage='Your drinks are saved on this device. Account sync is unavailable right now. Refresh to retry.';}
  finally {syncing=false;emit();if((getAccount().user?.id||null)!==userId)syncAccount(getAccount());}
}
onAccount(syncAccount);
addEventListener('storage',e=>{if(e.key===scope){records=read();emit();}});
let orderDialog;
export function showOrder(record){
  if(!orderDialog){orderDialog=document.createElement('dialog');orderDialog.className='sheet order-sheet';orderDialog.setAttribute('aria-labelledby','window-title');document.body.append(orderDialog);orderDialog.addEventListener('click',e=>{if(e.target===orderDialog)orderDialog.close();});}
  const combo=M.fixCombo(record.combo);
  orderDialog.innerHTML=`<form method="dialog" class="sheet-head"><p class="eyebrow">At the window</p><button class="icon-btn" aria-label="Close order mode">×</button></form><h2 id="window-title">${esc(record.name || M.comboTitle(combo))}</h2><p class="window-line">${esc(M.orderLine(combo))}</p><p class="form-note">Flavors and extras depend on your stand.${combo.sf?' Sugar-free flavors do not make the entire drink sugar-free.':''}</p><div class="actions"><button class="btn primary" type="button" id="window-copy">Copy order</button><a class="btn quiet" href="/?${esc(M.comboToQuery(combo))}#build">Tweak it ↗</a></div>`;
  orderDialog.querySelector('#window-copy').onclick=async e=>{try{await navigator.clipboard.writeText(M.orderLine(combo));e.target.textContent='Copied';}catch{notify('Select the order text to copy it.');}};
  orderDialog.showModal();
}
