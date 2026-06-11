-- Step 1: Drop the existing role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Re-add it with 'admin' included
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('coach', 'swimmer', 'admin'));
