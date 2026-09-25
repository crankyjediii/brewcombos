import * as M from '/lib/menu.js';
import { COMBOS } from '/lib/drinks.js';
import { cup, esc } from '/lib/layout.js';
import { drinkOfTheDay } from '/lib/daily.js';
import { searchCombos, tasteTags } from '/lib/discovery.js';
import { getSettings, onSettings } from '/assets/settings.js';
import { openShare } from '/assets/share.js';
import { getLibrary, isSaved, comboKey, saveLocal, updateLocal, removeLocal, exportLibrary, getSyncStatus, notify, showOrder } from '/assets/library.js';
import { initAccount, getAccount, onAccount, openAccount, listCommunity, submitDrink, moderateDrink } from '/assets/account.js';
const $=s=>document.querySelector(s);
let shown=8, category='any', savedFilter='all', community=[];
let currentResults=[];
const recipe = c => ({...c,combo:M.applyPrefs(M.fixCombo(c.combo),{...getSettings(),sf:getSettings().sf || undefined})});
const categories=['energy','coffee','tea','nocaf'].map(cat=>COMBOS.filter(c=>M.DRINK[c.combo.drink].cat===cat));
const catalog=Array.from({length:Math.max(...categories.map(g=>g.length))},(_,i)=>categories.map(g=>g[i]).filter(Boolean)).flat();
const icons={energy:'↯',coffee:'◒',tea:'❋',nocaf:'✳'};
function card(c,{saved=false,communityCard=false}={}) {
  const o=c.combo,d=M.DRINK[o.drink],tags=tasteTags(o), index=COMBOS.findIndex(x=>x.slug===c.slug);
  const savedOn=isSaved(o), key=c.slug || c.id;
  return `<article class="recipe-card" data-recipe="${esc(key)}"><div class="recipe-art art-${d.cat}" style="--card-index:${Math.max(index,0)%4}"><span class="art-type">${icons[d.cat] || '✳'} ${esc(d.name)}</span><button class="save-heart" type="button" data-card-save aria-label="${savedOn?'Unsave':'Save'} ${esc(c.name)}" aria-pressed="${savedOn}">${savedOn?'♥':'♡'}</button><button class="cup-link" type="button" data-order aria-label="View order for ${esc(c.name)}">${cup(o)}</button><span class="art-badge">${o.temp==='frozen'?'Blended':o.temp==='hot'?'Hot':'Iced'}${o.sf?' · SF requested':''}</span></div><div class="recipe-content"><div class="recipe-kicker">${communityCard?`Community · ${esc(c.author_name || 'Brew friend')}`:`${index>=0?'Recipe '+String(index+1).padStart(2,'0'):'Your saved order'} <span>·</span> ${esc(tags.slice(0,2).join(' + ') || d.name)}`}</div><h3>${c.slug?`<a href="/drinks/${c.slug}">${esc(c.name)}</a>`:communityCard?`<a href="/community/${esc(c.id)}">${esc(c.name)}</a>`:esc(c.name)}</h3><p class="recipe-flavors">${esc(o.flavors.join(' · ') || d.desc)}</p><div class="card-bottom"><button class="text-btn" type="button" data-order>Get the order <span aria-hidden="true">↗</span></button><button class="small-icon" type="button" data-card-share aria-label="Share ${esc(c.name)}">↥</button></div>${saved?`<div class="saved-controls"><label class="sr" for="state-${esc(c.id)}">Tried ${esc(c.name)}</label><select id="state-${esc(c.id)}" data-saved-state><option value="saved" ${c.status==='saved'?'selected':''}>Want to try</option><option value="tried" ${c.status==='tried'?'selected':''}>Tried it</option></select><select data-rating aria-label="Rate ${esc(c.name)}"><option value="">Rate it</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${c.rating===n?'selected':''}>${n} ${n===1?'star':'stars'}</option>`).join('')}</select><button class="small-icon" type="button" data-remove aria-label="Remove ${esc(c.name)}">×</button></div>`:''}</div></article>`;
}
function filters(){return {query:$('#search-drinks').value,category,temp:$('#filter-temp').value,taste:$('#filter-taste').value,exclude:$('#filter-exclude').value,sort:$('#sort-drinks').value};}
function renderDiscovery(){
  const f=filters();currentResults=searchCombos(catalog,f).map(recipe);
  $('#discovery-count').textContent=`${currentResults.length} ${currentResults.length===1?'recipe':'recipes'} to make your own`;
  $('#discovery-grid').innerHTML=currentResults.slice(0,shown).map(c=>card(c)).join('') || `<div class="empty-state"><span>☕</span><h3>No drinks with that mix.</h3><p>Try fewer filters or a different flavor. You can always build your own.</p><a class="btn quiet" href="#build">Open the builder ↗</a></div>`;
  $('#load-more').hidden=shown>=currentResults.length;
  $('#reset-filters').hidden=!f.query && f.category==='any' && f.temp==='any' && f.taste==='any' && !f.exclude;
}
function renderSaved(){
  const list=getLibrary().filter(c=>savedFilter==='all'||c.status===savedFilter);
  $('#saved-grid').innerHTML=list.map(c=>card(c,{saved:true})).join('') || `<div class="empty-state"><span>♡</span><h2>${savedFilter==='all'?'Your next favorite belongs here.':'Nothing here just yet.'}</h2><p>Tap the heart on a drink to keep it for later. Custom creations count, too.</p><a class="btn primary" href="/#recipe-book">Find a drink ↗</a></div>`;
  $('#sync-status').textContent=getSyncStatus();
  $('[data-saved-count]').textContent=getLibrary().length;
}
function findRecord(el){const id=el.closest('[data-recipe]')?.dataset.recipe;return [...currentResults,...getLibrary(),...community].find(c=>(c.slug||c.id)===id);}
document.addEventListener('click',e=>{
  const target=e.target.closest('[data-card-save],[data-order],[data-card-share],[data-remove]');if(!target)return;
  const c=findRecord(target);if(!c)return;
  if(target.hasAttribute('data-card-save')){if(isSaved(c.combo)){removeLocal(comboKey(c.combo));target.textContent='♡';target.setAttribute('aria-pressed','false');}else{saveLocal({name:c.name,combo:c.combo});target.textContent='♥';target.setAttribute('aria-pressed','true');}}
  if(target.hasAttribute('data-order'))showOrder(c);
  if(target.hasAttribute('data-remove'))removeLocal(c.id);
  if(target.hasAttribute('data-card-share')){const q=M.comboToQuery(c.combo)+'&n='+encodeURIComponent(c.name);openShare({url:c.community?`/community/${c.id}`:`/s?${q}`,title:c.name,text:M.orderLine(c.combo),card:`/card.png?${q}`,story:`/card.png?${q}&format=story`,filename:'brew-combos.png'});}
});
$('#saved-grid').addEventListener('change',e=>{const c=findRecord(e.target);if(!c)return;if(e.target.matches('[data-saved-state]'))updateLocal(c.id,{status:e.target.value});if(e.target.matches('[data-rating]'))updateLocal(c.id,{rating:e.target.value?+e.target.value:null});});
$('#categories').onclick=e=>{const b=e.target.closest('[data-category]');if(!b)return;category=b.dataset.category;$('#categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));shown=8;renderDiscovery();};
for(const id of ['search-drinks','filter-temp','filter-taste','filter-exclude','sort-drinks']) $('#'+id).addEventListener(id.includes('search')||id.includes('exclude')?'input':'change',()=>{shown=8;renderDiscovery();});
$('#toggle-filters').onclick=e=>{const visible=$('#advanced-filters').hidden;$('#advanced-filters').hidden=!visible;e.currentTarget.setAttribute('aria-expanded',visible);};
$('#reset-filters').onclick=()=>{category='any';$('#search-drinks').value='';$('#filter-temp').value='any';$('#filter-taste').value='any';$('#filter-exclude').value='';$('#categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.category==='any'));shown=8;renderDiscovery();};
$('#load-more').onclick=()=>{shown+=8;renderDiscovery();};
$('#surprise-discover').onclick=()=>{const picks=currentResults.length?currentResults:COMBOS.map(recipe);showOrder(picks[Math.floor(Math.random()*picks.length)]);};
$('#saved-filters').onclick=e=>{const b=e.target.closest('[data-saved-filter]');if(!b)return;savedFilter=b.dataset.savedFilter;$('#saved-filters').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderSaved();};
$('#export-library').onclick=exportLibrary;
addEventListener('bc:library',()=>{renderSaved();document.querySelectorAll('#discovery-grid [data-card-save],#community-grid [data-card-save]').forEach(b=>{const c=findRecord(b);if(c){const on=isSaved(c.combo);b.setAttribute('aria-pressed',on);b.textContent=on?'♥':'♡';b.setAttribute('aria-label',`${on?'Unsave':'Save'} ${c.name}`);}});});
addEventListener('keydown',e=>{if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();if(location.hash&&location.hash!=='#recipe-book')location.hash='recipe-book';$('#search-drinks').focus();}});
function daily(){const day=drinkOfTheDay(new Date()),c=recipe(day.drink);$('#daily-art').innerHTML=`<span class="daily-orbit" aria-hidden="true"></span><span class="daily-sticker" aria-hidden="true">TODAY’S<br>GOOD IDEA <i>↗</i></span>${cup(c.combo)}<span class="daily-flavor">${esc(c.combo.flavors.join(' + '))}</span>`;$('#daily-date').textContent='Drink of the day · '+day.label.split(',')[0];$('#daily-h').textContent=c.name;$('#daily-link').href='/drinks/'+c.slug;$('#recipe-total').textContent=COMBOS.length;}
function submissionCombo(){try{const value=JSON.parse(sessionStorage.getItem('bc_submission')||'null');if(value&&M.DRINK[value.drink])return M.comboFromQuery(M.comboToQuery(M.fixCombo(value)));return M.comboFromQuery(JSON.parse(localStorage.getItem('bc_draft')||'""'));}catch{return null;}}
function submissionPreview(){const o=submissionCombo();$('#submission-preview').innerHTML=o?.flavors.length?`<div class="submission-order"><p class="eyebrow">Your recipe</p><p>${esc(M.orderLine(o))}</p><a href="/?${esc(M.comboToQuery(o))}#build">Edit this drink ↗</a></div>`:'<p class="form-note">Build a drink with at least one flavor, then choose “Submit recipe.”</p>';}
let communityLoading=false;
async function loadCommunity(){
  if(communityLoading)return;communityLoading=true;$('#community-status').textContent='Opening the recipe book…';
  try {
    await initAccount();const a=getAccount();
    if(!a.configured){$('#community-status').innerHTML='<div class="empty-state"><span>✳</span><h3>A new recipe book is on its way.</h3><p>Community accounts and submissions are not open yet. You can already build a recipe and save it to My drinks on this device.</p><a href="#build" class="btn quiet">Make a drink ↗</a></div>';return;}
    community=(await listCommunity()).map(c=>({...c,community:true}));$('#community-grid').innerHTML=community.map(c=>card(c,{communityCard:true})).join('');
    $('#community-status').textContent=community.length?`${community.length} reviewed ${community.length===1?'recipe':'recipes'}. Community ideas; availability varies by stand.`:'The first page is still blank. Be the first to send in an order worth sharing.';
    $('#my-submissions').hidden=!a.user;
    if(a.user){const own=await listCommunity({mine:true});$('#submission-list').innerHTML=own.length?own.map(c=>`<article class="submission-row"><div><strong>${esc(c.name)}</strong><p>${esc(c.description)}</p></div><span class="status-pill">${esc(c.status)}</span></article>`).join(''):'<p>Your submitted recipes will appear here, along with their review status.</p>';}
    $('#moderation').hidden=!a.isAdmin;
    if(a.isAdmin){const pending=await listCommunity({moderation:true});$('#moderation-list').innerHTML=pending.length?pending.map(c=>`<article class="moderation-row"><h3>${esc(c.name)}</h3><p>By ${esc(c.author_name)}</p><p>${esc(c.description)}</p><p>${esc(M.orderLine(c.combo))}</p><div class="actions"><button class="btn" data-moderate="${esc(c.id)}" data-decision="approved">Approve</button><button class="btn quiet" data-moderate="${esc(c.id)}" data-decision="rejected">Reject</button></div></article>`).join(''):'<p>No recipes awaiting review.</p>';}
  } catch(err){$('#community-status').textContent=err.message || 'The community recipe book is unavailable. Please try again.';}
  finally {communityLoading=false;}
}
$('#refresh-community').onclick=loadCommunity;
$('#moderation-list').onclick=async e=>{const b=e.target.closest('[data-moderate]');if(!b)return;b.disabled=true;try{await moderateDrink(b.dataset.moderate,b.dataset.decision);await loadCommunity();}catch(err){notify(err.message);b.disabled=false;}};
$('#submission-form').onsubmit=async e=>{
  e.preventDefault();const status=$('#submission-status'),a=getAccount(),combo=submissionCombo();
  if(!a.configured){status.textContent='Community submissions are not open yet. Your recipe can still be saved in My drinks.';return;}
  if(!a.user){status.textContent='Sign in with your email to submit this recipe.';openAccount();return;}
  if(!combo?.flavors.length){status.textContent='Build a drink with at least one flavor first.';return;}
  const b=$('#submit-community');b.disabled=true;status.textContent='Sending your recipe…';
  try{await submitDrink({name:$('#submission-name').value,author_name:$('#submission-author').value,description:$('#submission-description').value,combo});status.textContent='Sent for review. You can follow its status under Your submissions.';$('#submission-form').reset();await loadCommunity();}
  catch(err){status.textContent=err.message||'Your recipe could not be sent. Please try again.';}finally{b.disabled=false;}
};
function route(){
  const hash=location.hash.slice(1),page=['saved','community'].includes(hash)?hash:['vibe','build'].includes(hash)?'tools':'discover';
  document.querySelectorAll('[data-view]').forEach(el=>el.hidden=el.dataset.view!==page);
  document.querySelectorAll('[data-nav]').forEach(el=>{if(el.dataset.nav===(page==='tools'?'vibe':page))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if(page==='tools')$('#tools-heading').textContent=hash==='build'?'A drink, your way.':'Made to your mood.';
  if(page==='saved')renderSaved();if(page==='community'){submissionPreview();loadCommunity();}
  if(hash==='recipe-book')requestAnimationFrame(()=>$('#recipe-book').scrollIntoView());
  else if(!location.search)scrollTo({top:0,behavior:'instant'});
}
onAccount(a=>{document.querySelectorAll('[data-account]').forEach(b=>b.innerHTML=a.user?'My account <span aria-hidden="true">↗</span>':'Sign in <span aria-hidden="true">↗</span>');if(location.hash==='#community')loadCommunity();});
onSettings((s,key)=>{if(['size','milk','sf'].includes(key)){renderDiscovery();daily();}});
addEventListener('hashchange',route);
renderDiscovery();renderSaved();daily();route();initAccount();

// Keep skip navigation inside the current hash-based view.
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const main=document.getElementById('main');main.focus({preventScroll:true});main.scrollIntoView({behavior:'instant'});});
