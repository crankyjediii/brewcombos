import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fixCombo } from '../lib/menu.js';

// Execute the real migration in PostgreSQL with the Supabase auth primitives.
// Hosted email, PostgREST and Supabase-specific deployment still need a smoke test.
test('database migration enforces account isolation and approval at the database boundary',async()=>{
  const db=new PGlite();
  const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
  const combo=fixCombo({drink:'latte',flavors:['Vanilla'],extras:[],sf:true,sweet:'half'});
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202609250001_community.sql',import.meta.url),'utf8'));
    for(const id of [alice,bob,admin])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@test.invalid']);
    await db.query('insert into public.community_admins(user_id) values($1)',[admin]);
    async function asUser(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`);}
    await asUser(alice);
    await db.query('insert into saved_drinks(user_id,id,name,combo) values($1,$2,$3,$4)',[alice,'vanilla','Vanilla',combo]);
    await assert.rejects(db.query('insert into saved_drinks(user_id,id,name,combo) values($1,$2,$3,$4)',[bob,'stolen','Other user',combo]),/row-level security/);
    const submitted=await db.query('insert into community_drinks(user_id,name,description,author_name,combo) values($1,$2,$3,$4,$5) returning id',[alice,'Vanilla cloud','Vanilla and oat milk, half sweet.','Alice',combo]);
    const id=submitted.rows[0].id;
    assert.equal((await db.query('select status from community_drinks')).rows[0].status,'pending');
    await assert.rejects(db.query("update community_drinks set status='approved' where id=$1 returning id",[id]).then(r=>{if(!r.rows.length)throw Error('row-level security');}),/row-level security/);
    await assert.rejects(db.query('insert into community_admins(user_id) values($1)',[alice]),/permission denied/);
    await asUser(bob);assert.equal((await db.query('select * from saved_drinks')).rows.length,0);assert.equal((await db.query('select * from community_drinks')).rows.length,0);
    await asUser(null,'anon');assert.equal((await db.query('select name from community_drinks')).rows.length,0);await assert.rejects(db.query('select * from saved_drinks'),/permission denied/);
    await asUser(admin);const approved=await db.query("update community_drinks set status='approved' where id=$1 returning reviewed_by,reviewed_at",[id]);assert.equal(approved.rows[0].reviewed_by,admin);assert.ok(approved.rows[0].reviewed_at);
    await asUser(null,'anon');assert.equal((await db.query('select name from community_drinks')).rows[0].name,'Vanilla cloud');await assert.rejects(db.query('select user_id from community_drinks'),/permission denied/);
    await asUser(alice);await assert.rejects(db.query('update community_drinks set description=$1 where id=$2',['Changed after review',id]),/permission denied/);
    for(let i=0;i<4;i++)await db.query('insert into community_drinks(user_id,name,description,author_name,combo) values($1,$2,$3,$4,$5)',[alice,'Recipe '+i,'Enough description for a recipe','Alice',combo]);
    await assert.rejects(db.query('insert into community_drinks(user_id,name,description,author_name,combo) values($1,$2,$3,$4,$5)',[alice,'Too many','Enough description for a recipe','Alice',combo]),/submission_rate_limit/);
  }finally{await db.close();}
});
