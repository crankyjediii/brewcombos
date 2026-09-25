import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/community-page.js';
import { fixCombo } from '../lib/menu.js';
const originalFetch=global.fetch, originalEnv={...process.env};
after(()=>{global.fetch=originalFetch;process.env=originalEnv;});
const id='11111111-1111-4111-8111-111111111111';
const combo=fixCombo({drink:'latte',flavors:['Vanilla'],extras:[]});
const record={id,name:'Vanilla Cloud',description:'Vanilla with oat milk.',author_name:'Sam',combo,reviewed_at:'2026-09-25T12:00:00Z'};
async function call(url){const headers={};let body;const res={statusCode:200,setHeader:(k,v)=>headers[k.toLowerCase()]=v,end:s=>body=s};await handler({url,method:'GET'},res);return {code:res.statusCode,headers,body};}
test('community recipe pages and sitemap use only approved public records',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_ANON_KEY='sb_publishable_test';
 const calls=[];global.fetch=async url=>{calls.push(url);return new Response(JSON.stringify([record]));};
 const page=await call('/community/'+id);assert.equal(page.code,200);assert.match(page.body,/<h1>Vanilla Cloud<\/h1>/);assert.match(page.body,/rel="canonical" href="https:\/\/brewcombos.com\/community\//);assert.match(page.body,/data-page-save/);assert.match(page.body,/Can I get a medium iced latte with vanilla/);assert.match(calls[0],/status=eq.approved/);assert.doesNotMatch(calls[0],/user_id|email|reviewed_by/);
 const sitemap=await call('/community-sitemap.xml');assert.match(sitemap.body,/<lastmod>2026-09-25<\/lastmod>/);assert.match(sitemap.body,new RegExp(id));
});
test('missing, pending and unconfigured community pages cannot leak a recipe',async()=>{
 global.fetch=async()=>new Response('[]');assert.equal((await call('/community/'+id)).code,404);assert.equal((await call('/community/not-an-id')).code,404);
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;const page=await call('/community');assert.match(page.body,/noindex/);assert.equal((await call('/community/'+id)).code,404);
});
