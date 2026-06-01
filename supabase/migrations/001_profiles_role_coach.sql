-- Run once in Supabase SQL Editor (project: imu_reader)
alter table profiles
  add column if not exists role text check (role in ('coach', 'swimmer')),
  add column if not exists coach_id uuid references profiles(id);

create index if not exists profiles_coach_id_idx on profiles(coach_id);
create index if not exists profiles_role_idx on profiles(role);

update profiles set role = 'swimmer' where role is null;
