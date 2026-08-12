-- Palladium: user accounts and learning progress.
-- Run this in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 80
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_id text not null check (char_length(quiz_id) between 1 and 100),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  completed_at timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);

create table if not exists public.activity_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  activity_id text not null check (char_length(activity_id) between 1 and 100),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);

-- Server-side administrator allowlist. Change this address if the administrator
-- signs in with a different email account.
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(btrim(email)))
);

insert into public.admin_allowlist (email)
values ('muralipalla@gmail.com')
on conflict (email) do nothing;

create index if not exists quiz_attempts_user_quiz_date_idx
  on public.quiz_attempts (user_id, quiz_id, completed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists activity_state_set_updated_at on public.activity_state;
create trigger activity_state_set_updated_at
before update on public.activity_state
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(
      left(
        btrim(
          coalesce(
            new.raw_user_meta_data ->> 'display_name',
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            ''
          )
        ),
        80
      ),
      ''
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.activity_state enable row level security;
alter table public.admin_allowlist enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_allowlist
    where email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    users.id,
    users.email::text,
    profiles.display_name,
    users.created_at,
    users.last_sign_in_at
  from auth.users as users
  left join public.profiles as profiles on profiles.user_id = users.id
  order by users.last_sign_in_at desc nulls last, users.created_at desc;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_select_own on public.quiz_attempts;
create policy quiz_attempts_select_own
on public.quiz_attempts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_insert_own on public.quiz_attempts;
create policy quiz_attempts_insert_own
on public.quiz_attempts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_delete_own on public.quiz_attempts;
create policy quiz_attempts_delete_own
on public.quiz_attempts for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists activity_state_select_own on public.activity_state;
create policy activity_state_select_own
on public.activity_state for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists activity_state_insert_own on public.activity_state;
create policy activity_state_insert_own
on public.activity_state for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists activity_state_update_own on public.activity_state;
create policy activity_state_update_own
on public.activity_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists activity_state_delete_own on public.activity_state;
create policy activity_state_delete_own
on public.activity_state for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table
  public.profiles,
  public.quiz_attempts,
  public.activity_state,
  public.admin_allowlist
from anon;

revoke all on table public.admin_allowlist from authenticated;
revoke all on function public.is_site_admin() from public;
revoke all on function public.admin_list_users() from public;

grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, delete on table public.quiz_attempts to authenticated;
grant select, insert, update, delete on table public.activity_state to authenticated;
grant execute on function public.is_site_admin() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
