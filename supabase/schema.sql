-- Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.cartoon_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  poster_path text,
  banner_url text,
  release_year integer,
  language text not null default 'Tamil',
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.cartoon_series(id) on delete cascade,
  season_number integer not null default 1,
  title text not null default 'Season 1',
  unique(series_id, season_number)
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  episode_number integer not null,
  title text not null,
  description text not null default '',
  duration_seconds integer,
  storage_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique(season_id, episode_number)
);

create table if not exists public.watchlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.cartoon_series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, series_id)
);

create table if not exists public.watch_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  progress_seconds integer not null default 0 check (progress_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id, episode_id)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.cartoon_series enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.watchlist enable row level security;
alter table public.watch_history enable row level security;

create policy "profiles readable by owner or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "published series public read" on public.cartoon_series for select
using (status = 'published' or public.is_admin());
create policy "admins manage series" on public.cartoon_series for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "seasons public read when series published" on public.seasons for select
using (exists(select 1 from public.cartoon_series s where s.id = series_id and (s.status = 'published' or public.is_admin())));
create policy "admins manage seasons" on public.seasons for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "published episodes read" on public.episodes for select
using (is_published or public.is_admin());
create policy "admins manage episodes" on public.episodes for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "users manage own watchlist" on public.watchlist for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own history" on public.watch_history for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage buckets: create `episodes` as PRIVATE in Dashboard -> Storage.
-- These policies allow admins to upload/delete and signed playback URLs to be created
-- by authenticated users only when the associated episode is published or they are admins.
create policy "admins upload episode files" on storage.objects for insert to authenticated
with check (bucket_id = 'episodes' and public.is_admin());
create policy "admins update episode files" on storage.objects for update to authenticated
using (bucket_id = 'episodes' and public.is_admin())
with check (bucket_id = 'episodes' and public.is_admin());
create policy "admins delete episode files" on storage.objects for delete to authenticated
using (bucket_id = 'episodes' and public.is_admin());
create policy "signed-in users read episode files" on storage.objects for select to authenticated
using (bucket_id = 'episodes' and (public.is_admin() or exists(
  select 1 from public.episodes e where e.storage_path = name and e.is_published
)));
