-- Fix Row Level Security for race_queue
-- Allow all authenticated users to update any queue entry for matchmaking

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can update own queue entries" ON race_queue;
DROP POLICY IF EXISTS "Users can view own queue entries" ON race_queue;
DROP POLICY IF EXISTS "Users can delete own queue entries" ON race_queue;
DROP POLICY IF EXISTS "Users can insert own queue entries" ON race_queue;

-- Create permissive policies for matchmaking
-- Everyone can see all queue entries (needed for matchmaking)
CREATE POLICY "Anyone can view queue entries"
  ON race_queue FOR SELECT
  USING (true);

-- Everyone can insert their own entry
CREATE POLICY "Users can insert queue entries"
  ON race_queue FOR INSERT
  WITH CHECK (true);

-- Everyone can update ANY queue entry (needed for matchmaking coordination)
CREATE POLICY "Anyone can update queue entries"
  ON race_queue FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Everyone can delete queue entries (for cleanup)
CREATE POLICY "Anyone can delete queue entries"
  ON race_queue FOR DELETE
  USING (true);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'race_queue';
