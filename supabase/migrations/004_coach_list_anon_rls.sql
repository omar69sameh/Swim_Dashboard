-- Allow unauthenticated (anon) users to list coach profiles.
-- Required so the mobile signup screen can populate the coach picker
-- before the user has an account / session.
-- Run in Supabase SQL Editor after migration 003.

create policy "Anon users can list coach profiles"
  on public.profiles for select
  to anon
  using (role = 'coach');
