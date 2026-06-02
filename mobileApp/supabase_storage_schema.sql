-- Session CSV files in Storage for dashboard / automatic download
--
-- Step 1: Create the bucket in Supabase Dashboard
--   Storage (left sidebar) → New bucket → Name: session-csvs, Public: OFF → Create
--
-- Step 2: Run the policies below in SQL Editor

-- Policy: users can upload only to path starting with their own user id (userId/filename.csv)
create policy "Users can upload own session CSVs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'session-csvs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: users can read only their own folder
create policy "Users can read own session CSVs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'session-csvs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: users can delete their own files (optional)
create policy "Users can delete own session CSVs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'session-csvs'
  and (storage.foldername(name))[1] = auth.uid()::text
);
