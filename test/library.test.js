import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as M from '../lib/menu.js';

function library(initial={}){
  const storage=new Map(Object.entries(initial));let account={user:null},listener;const cloud=new Map(),calls=[];
  const toast={classList:{add(){},remove(){}},setAttribute(){}};
  const context={M,esc:String,console,Date,Map,Set,JSON,URL,Blob,CustomEvent:class{},dispatchEvent(){},addEventListener(){},setTimeout:()=>1,clearTimeout(){},document:{getElementById:()=>toast},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    getAccount:()=>account,onAccount:fn=>{listener=fn},
    listSaved:async()=>[...(cloud.get(account.user.id)||new Map()).values()],
    saveDrink:async r=>{const uid=account.user.id;calls.push(['save',uid,r.id]);if(!cloud.has(uid))cloud.set(uid,new Map());const row={...r,updated_at:new Date().toISOString()};cloud.get(uid).set(r.id,row);return row;},
    deleteSaved:async id=>{calls.push(['delete',account.user.id,id]);cloud.get(account.user.id)?.delete(id);},
  };
  const source=readFileSync(new URL('../assets/library.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  runInNewContext(source+'\nglobalThis.lib={getLibrary,saveLocal,updateLocal,removeLocal,comboKey,isSaved,getSyncStatus};',context);
  return {...context.lib,storage,cloud,calls,auth:async id=>{account={user:id?{id}:null};await listener(account);},flush:async()=>{for(let i=0;i<12;i++)await Promise.resolve();}};
}
const combo=M.fixCombo({drink:'latte',flavors:['Vanilla'],extras:[]});

test('library ignores broken stored values, deduplicates recipes and preserves custom flavors',()=>{
  const l=library({bc_library_v1:'{"invalid":true}'});
  assert.equal(l.getLibrary().length,0);
  l.saveLocal({name:'My drink',combo:{...combo,flavors:['Vanilla','Honey']}});
  l.saveLocal({name:'My renamed drink',combo:{...combo,flavors:['Honey','Vanilla']}});
  assert.equal(l.getLibrary().length,1);
  assert.equal(l.getLibrary()[0].name,'My renamed drink');
  assert.deepEqual([...l.getLibrary()[0].combo.flavors],['Honey','Vanilla']);
});
test('rating implies tried and can be cleared or changed back to want-to-try',()=>{
  const l=library(),r=l.saveLocal({name:'Vanilla latte',combo});
  l.updateLocal(r.id,{rating:4});assert.equal(l.getLibrary()[0].status,'tried');
  l.updateLocal(r.id,{rating:null});assert.equal(l.getLibrary()[0].rating,null);
  l.updateLocal(r.id,{rating:5});l.updateLocal(r.id,{status:'saved'});
  assert.equal(l.getLibrary()[0].status,'saved');assert.equal(l.getLibrary()[0].rating,null);
});
test('guest saves migrate once; switching accounts never uploads the previous account library',async()=>{
  const l=library();l.saveLocal({name:'Guest latte',combo});
  await l.auth('alice');assert.equal(l.getLibrary().length,1);assert.equal(l.cloud.get('alice').size,1);
  await l.auth(null);assert.equal(l.getLibrary().length,0);
  await l.auth('bob');assert.equal(l.getLibrary().length,0);assert.equal(l.cloud.get('bob'),undefined);
  await l.auth('alice');assert.equal(l.getLibrary()[0].name,'Guest latte');
  assert.equal(l.calls.filter(c=>c[0]==='save').length,1);
});
test('cloud deletions are not resurrected by a previously synced device',async()=>{
  const l=library();l.saveLocal({name:'Vanilla latte',combo});await l.auth('alice');
  l.cloud.get('alice').clear();await l.auth(null);await l.auth('alice');
  assert.equal(l.getLibrary().length,0);assert.equal(l.cloud.get('alice').size,0);
});
test('removing a synced drink removes the cloud copy and local tombstone after success',async()=>{
  const l=library();const r=l.saveLocal({name:'Vanilla latte',combo});await l.auth('alice');
  l.removeLocal(r.id);await l.flush();assert.equal(l.getLibrary().length,0);assert.equal(l.cloud.get('alice').size,0);
  assert.deepEqual(JSON.parse(l.storage.get('bc_library_v1_alice_removed')),[]);
});
