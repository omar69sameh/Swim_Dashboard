-- Run this in Supabase Dashboard → SQL Editor to create tables and RLS.
-- Replace 'auth.users' if your Supabase project uses a different auth schema.

-- Profiles: extra user info (name, age). id = auth.users.id
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  age int default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile when a user signs up (avoids RLS blocking the app's first insert)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, age)
  values (new.id, '', '', 0);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Swimming sessions: one row per recording, owned by user_id
-- csv_content: full CSV file as stored; download uses this so file is exactly "as saved"
create table if not exists public.swimming_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  swimmer_info jsonb,
  device_info jsonb,
  session_metadata jsonb,
  samples jsonb,
  csv_content text,
  created_at timestamptz default now()
);


alter table public.swimming_sessions enable row level security;

create policy "Users can insert own sessions"
  on public.swimming_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can select own sessions"
  on public.swimming_sessions for select
  using (auth.uid() = user_id);

-- Optional: index for listing by user
create index if not exists idx_swimming_sessions_user_id
  on public.swimming_sessions(user_id);
create index if not exists idx_swimming_sessions_created_at
  on public.swimming_sessions(created_at desc);

-- If you created swimming_sessions before csv_content existed, run this once:
-- alter table public.swimming_sessions add column if not exists csv_content text;
