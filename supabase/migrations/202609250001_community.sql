-- Apply through the Supabase SQL editor or `supabase db push`.
-- No service-role credential is required by the website.
begin;

create schema if not exists brew_private;
revoke all on schema brew_private from public, anon, authenticated;
grant usage on schema brew_private to anon, authenticated;

create function brew_private.valid_drink_combo(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d text; t text; m text; x text; f jsonb;
begin
  if jsonb_typeof(c) <> 'object' or not c ?& array['drink','temp','size','milk','flavors','extras','sf','sweet'] then return false; end if;
  if (select count(*) from jsonb_object_keys(c)) <> 8 then return false; end if;
  d := c->>'drink'; t := c->>'temp'; m := c->>'milk';
  if d not in ('breve','latte','mocha','coldbrew','americano','energy','fizz','lemonade','tea','chai','matcha','smoothie','shake') then return false; end if;
  if t not in ('hot','iced','frozen') or c->>'size' not in ('small','medium','large') then return false; end if;
  if d in ('coldbrew','fizz') and t <> 'iced' then return false; end if;
  if d in ('americano','tea') and t = 'frozen' then return false; end if;
  if d in ('energy','lemonade') and t = 'hot' then return false; end if;
  if d in ('smoothie','shake') and t <> 'frozen' then return false; end if;
  if d in ('latte','mocha','chai','matcha') then
    if m not in ('whole','skim','oat','almond','coconut') then return false; end if;
  elsif d = 'coldbrew' then
    if m not in ('none','cream','oat','almond') then return false; end if;
  elsif m <> '' then return false;
  end if;
  if jsonb_typeof(c->'sf') <> 'boolean' or c->>'sweet' not in ('quarter','half','regular','extra') then return false; end if;
  if jsonb_typeof(c->'flavors') <> 'array' or jsonb_typeof(c->'extras') <> 'array' then return false; end if;
  if jsonb_array_length(c->'flavors') > 6 or jsonb_array_length(c->'extras') > 9 then return false; end if;
  for f in select value from jsonb_array_elements(c->'flavors') loop
    if jsonb_typeof(f) <> 'string' or char_length(f #>> '{}') not between 1 and 30 or (f #>> '{}') ~ '[<>[:cntrl:]]' then return false; end if;
  end loop;
  for f in select value from jsonb_array_elements(c->'extras') loop
    if jsonb_typeof(f) <> 'string' then return false; end if;
    x := f #>> '{}';
    if x not in ('softtop','coldfoam','whip','caramel','chocolate','whitechoc','shot','cream','lightice') then return false; end if;
    if x in ('softtop','coldfoam') and t = 'hot' then return false; end if;
    if x = 'lightice' and t <> 'iced' then return false; end if;
    if x = 'shot' and d not in ('breve','latte','mocha','coldbrew','americano','chai') then return false; end if;
    if x = 'cream' and d not in ('energy','fizz','lemonade') then return false; end if;
  end loop;
  -- JSON null must never turn a CHECK expression into an accidental pass.
  for x in select unnest(array['drink','temp','size','milk','sweet']) loop
    if jsonb_typeof(c->x) <> 'string' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function brew_private.valid_drink_combo(jsonb) from public;
grant execute on function brew_private.valid_drink_combo(jsonb) to anon, authenticated;

create table public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.community_admins enable row level security;
revoke all on public.community_admins from public, anon, authenticated;
grant select (user_id) on public.community_admins to authenticated;
create policy "Admins can check their own membership" on public.community_admins
  for select to authenticated using (user_id = (select auth.uid()));

create function brew_private.is_community_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_admins where user_id = (select auth.uid()));
$$;
revoke all on function brew_private.is_community_admin() from public;
grant execute on function brew_private.is_community_admin() to anon, authenticated;

create function brew_private.is_email_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = (select auth.uid())
    and email is not null and email_confirmed_at is not null and is_anonymous is not true);
$$;
revoke all on function brew_private.is_email_member() from public;
grant execute on function brew_private.is_email_member() to authenticated;

create table public.saved_drinks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 2048),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  combo jsonb not null check (brew_private.valid_drink_combo(combo)),
  status text not null default 'saved' check (status in ('saved','tried')),
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (status = 'tried' or rating is null)
);
create index saved_drinks_owner_updated on public.saved_drinks(user_id, updated_at desc);
alter table public.saved_drinks enable row level security;
revoke all on public.saved_drinks from public, anon, authenticated;
grant select, delete on public.saved_drinks to authenticated;
grant insert (user_id,id,name,combo,status,rating), update (user_id,id,name,combo,status,rating) on public.saved_drinks to authenticated;
create policy "Read own saved drinks" on public.saved_drinks for select to authenticated using (user_id = (select auth.uid()));
create policy "Save own drinks" on public.saved_drinks for insert to authenticated with check (user_id = (select auth.uid()) and (select brew_private.is_email_member()));
create policy "Update own saved drinks" on public.saved_drinks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select brew_private.is_email_member()));
create policy "Remove own saved drinks" on public.saved_drinks for delete to authenticated using (user_id = (select auth.uid()));

create function brew_private.check_saved_drink() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.id <> old.id) then
    raise exception 'saved_identity_immutable' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if not exists(select 1 from public.saved_drinks where user_id = new.user_id and id = new.id)
      and (select count(*) from public.saved_drinks where user_id = new.user_id) >= 500 then
      raise exception 'saved_drink_limit';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function brew_private.check_saved_drink() from public, anon, authenticated;
create trigger validate_saved_drink before insert or update on public.saved_drinks
  for each row execute function brew_private.check_saved_drink();

create table public.community_drinks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60 and name !~ '[[:cntrl:]]'),
  description text not null check (char_length(btrim(description)) between 10 and 280 and description !~ '[[:cntrl:]]'),
  author_name text not null check (char_length(btrim(author_name)) between 2 and 40 and author_name !~ '[[:cntrl:]]'),
  combo jsonb not null check (brew_private.valid_drink_combo(combo) and jsonb_array_length(combo->'flavors') > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  check ((status = 'pending' and reviewed_at is null and reviewed_by is null) or (status <> 'pending' and reviewed_at is not null))
);
create index community_drinks_public on public.community_drinks(status, reviewed_at desc);
create index community_drinks_owner on public.community_drinks(user_id, created_at desc);
alter table public.community_drinks enable row level security;
revoke all on public.community_drinks from public, anon, authenticated;
grant select (id,name,description,author_name,combo,status,created_at,reviewed_at) on public.community_drinks to anon;
grant select on public.community_drinks to authenticated;
grant insert (user_id,name,description,author_name,combo,status) on public.community_drinks to authenticated;
-- Owners cannot edit a previously approved drink or make one public themselves.
grant update (status) on public.community_drinks to authenticated;
create policy "Read approved community drinks" on public.community_drinks for select to anon, authenticated using (status = 'approved');
create policy "Read own submissions" on public.community_drinks for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read review queue" on public.community_drinks for select to authenticated using ((select brew_private.is_community_admin()));
create policy "Submit for approval" on public.community_drinks for insert to authenticated
  with check (user_id = (select auth.uid()) and (select brew_private.is_email_member()) and status = 'pending' and reviewed_at is null and reviewed_by is null);
create policy "Only admins may review" on public.community_drinks for update to authenticated
  using ((select brew_private.is_community_admin()) and status = 'pending')
  with check ((select brew_private.is_community_admin()) and status in ('approved','rejected'));

create function brew_private.check_community_drink() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
    if (select count(*) from public.community_drinks where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'submission_rate_limit';
    end if;
    new.created_at := now();
    if new.status <> 'pending' then raise exception 'approval_required' using errcode = '42501'; end if;
    new.reviewed_at := null;
    new.reviewed_by := null;
  else
    if not brew_private.is_community_admin() or old.status <> 'pending' or new.status not in ('approved','rejected') then
      raise exception 'admin_review_required' using errcode = '42501';
    end if;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function brew_private.check_community_drink() from public, anon, authenticated;
create trigger validate_community_drink before insert or update on public.community_drinks
  for each row execute function brew_private.check_community_drink();

commit;
