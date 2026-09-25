import * as M from '/lib/menu.js';
import { getSettings, onSettings } from '/assets/settings.js';
import { getLibrary, isSaved, saveLocal, showOrder } from '/assets/library.js';
import { initAccount, onAccount } from '/assets/account.js';
let source=null;
try { source=JSON.parse((document.getElementById('combo-data') || document.getElementById('shared-combo-data'))?.textContent || 'null'); } catch {}
const current=()=> {
  if(!source)return null;
  const standardShown=document.getElementById('prefs-note')?.textContent.includes('Showing the standard recipe');
  return {...source,combo:standardShown?M.fixCombo(source.combo):M.applyPrefs(M.fixCombo(source.combo),{...getSettings(),sf:getSettings().sf || undefined})};
};
function update(){
  document.querySelectorAll('[data-saved-count]').forEach(x=>x.textContent=getLibrary().length);
  const c=current();document.querySelectorAll('[data-page-save]').forEach(b=>b.textContent=c&&isSaved(c.combo)?'Saved to my drinks':'Save drink');
}
document.addEventListener('click',e=>{const c=current();if(!c)return;if(e.target.closest('[data-page-save]'))saveLocal(c);if(e.target.closest('[data-page-order]'))showOrder(c);if(e.target.closest('[data-toggle]'))update();});
addEventListener('bc:library',update);onSettings(update);onAccount(a=>document.querySelectorAll('[data-account]').forEach(b=>b.textContent=a.user?'My account ↗':'Sign in ↗'));
const collection=document.querySelector('.collection');
if(collection){
  const search=document.createElement('div');search.className='list-search';
  search.innerHTML='<label class="sr" for="catalog-search">Search this collection</label><input id="catalog-search" type="search" placeholder="Search drink names, flavors, or bases…"><span role="status" id="catalog-count"></span>';
  collection.querySelector('.group-nav')?.after(search);
  const rows=[...collection.querySelectorAll('.combo-list li')];
  function filter(){const words=search.querySelector('input').value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;rows.forEach(row=>{row.hidden=!words.every(w=>row.textContent.toLocaleLowerCase().includes(w));if(!row.hidden)count++;});search.querySelector('#catalog-count').textContent=`${count} ${count===1?'recipe':'recipes'}`;collection.querySelectorAll('section').forEach(section=>{const items=[...section.querySelectorAll('.combo-list li')];if(items.length)section.hidden=items.every(x=>x.hidden);});}
  search.querySelector('input').addEventListener('input',filter);filter();
}
update();initAccount();

// Keep skip navigation inside the current hash-based view.
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const main=document.getElementById('main');main.focus({preventScroll:true});main.scrollIntoView({behavior:'instant'});});
