-- Allow swimmers to list coach profiles (for mobile/web coach picker)
-- Run in Supabase SQL Editor after 001 and 002

create policy "Authenticated users can list coach profiles"
  on public.profiles for select
  to authenticated
  using (role = 'coach');
