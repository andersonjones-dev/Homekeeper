-- HomeKeeper cloud backup, in the shared Supabase project (also used by Let's Go).
-- Safe to run again: everything is create-if-not-exists / create-or-replace.
--
-- One "home" holds the whole HomeKeeper data set as JSON. Family members who
-- joined with an invite link share the home. Only signed-in email accounts can
-- use it (Let's Go's anonymous accounts can't). Nobody can read a home they
-- aren't a member of. Writes go through hk_save, which refuses an out-of-date
-- copy so two phones never overwrite each other (the app merges and retries).

create table if not exists public.hk_homes (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  invite_secret text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hk_members (
  home_id uuid not null references public.hk_homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  joined_at timestamptz not null default now(),
  primary key (home_id, user_id)
);
create index if not exists hk_members_user on public.hk_members(user_id);

alter table public.hk_homes enable row level security;
alter table public.hk_members enable row level security;

revoke all on public.hk_homes from anon, authenticated;
revoke all on public.hk_members from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.hk_members to authenticated;

-- A real (email) account, not an anonymous one.
create or replace function public.hk_real_user()
returns uuid language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
              then auth.uid() end
$$;

create or replace function public.hk_is_member(p_home uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hk_members where home_id = p_home and user_id = public.hk_real_user())
$$;

drop policy if exists "hk members see their homes' members" on public.hk_members;
create policy "hk members see their homes' members" on public.hk_members
  for select to authenticated using (public.hk_is_member(home_id));
-- hk_homes has no table policies on purpose: it is only reached through the functions below.

-- The signed-in person's home (most recently joined), with its data.
create or replace function public.hk_my_home()
returns table (id uuid, name text, data jsonb, version bigint, invite_secret text, updated_at timestamptz, members bigint)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.hk_real_user();
begin
  if me is null then raise exception 'Sign in with your email first' using errcode = '42501'; end if;
  return query
    select h.id, h.name, h.data, h.version, h.invite_secret, h.updated_at,
           (select count(*) from public.hk_members x where x.home_id = h.id)
    from public.hk_homes h join public.hk_members m on m.home_id = h.id
    where m.user_id = me
    order by m.joined_at desc
    limit 1;
end $$;

-- Start a home from this phone's data.
create or replace function public.hk_create_home(p_data jsonb, p_name text default 'Home')
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.hk_real_user(); h uuid;
begin
  if me is null then raise exception 'Sign in with your email first' using errcode = '42501'; end if;
  insert into public.hk_homes (name, data) values (coalesce(nullif(p_name, ''), 'Home'), coalesce(p_data, '{}'::jsonb)) returning id into h;
  insert into public.hk_members (home_id, user_id, email) values (h, me, auth.jwt() ->> 'email');
  return h;
end $$;

-- Save. Returns the new version, or -1 if someone else saved first (re-read, merge, retry).
create or replace function public.hk_save(p_home uuid, p_data jsonb, p_version bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not public.hk_is_member(p_home) then raise exception 'Not a member of this home' using errcode = '42501'; end if;
  update public.hk_homes set data = p_data, version = version + 1, updated_at = now()
    where id = p_home and version = p_version
    returning version into v;
  return coalesce(v, -1);
end $$;

-- Join a home from an invite link (home id + secret).
create or replace function public.hk_join(p_home uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := public.hk_real_user();
begin
  if me is null then raise exception 'Sign in with your email first' using errcode = '42501'; end if;
  if not exists (select 1 from public.hk_homes where id = p_home and invite_secret = p_secret) then
    raise exception 'This invite link is not valid any more' using errcode = '22023';
  end if;
  insert into public.hk_members (home_id, user_id, email) values (p_home, me, auth.jwt() ->> 'email')
    on conflict (home_id, user_id) do nothing;
  return true;
end $$;

-- Make a new invite link (the old one stops working).
create or replace function public.hk_new_invite(p_home uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.hk_is_member(p_home) then raise exception 'Not a member of this home' using errcode = '42501'; end if;
  update public.hk_homes set invite_secret = s where id = p_home;
  return s;
end $$;

-- Stop sharing a home on this account. The last member leaving keeps the home's
-- data stored, in case they sign in again later and want it back via support.
create or replace function public.hk_leave(p_home uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.hk_members where home_id = p_home and user_id = public.hk_real_user();
end $$;

revoke all on function public.hk_real_user() from public, anon;
revoke all on function public.hk_is_member(uuid) from public, anon;
revoke all on function public.hk_my_home() from public, anon;
revoke all on function public.hk_create_home(jsonb, text) from public, anon;
revoke all on function public.hk_save(uuid, jsonb, bigint) from public, anon;
revoke all on function public.hk_join(uuid, text) from public, anon;
revoke all on function public.hk_new_invite(uuid) from public, anon;
revoke all on function public.hk_leave(uuid) from public, anon;
grant execute on function public.hk_real_user() to authenticated;
grant execute on function public.hk_is_member(uuid) to authenticated;
grant execute on function public.hk_my_home() to authenticated;
grant execute on function public.hk_create_home(jsonb, text) to authenticated;
grant execute on function public.hk_save(uuid, jsonb, bigint) to authenticated;
grant execute on function public.hk_join(uuid, text) to authenticated;
grant execute on function public.hk_new_invite(uuid) to authenticated;
grant execute on function public.hk_leave(uuid) to authenticated;
