-- Fix the status constraint to allow 'matching' status
-- This is needed for atomic matchmaking

-- Drop the old constraint
ALTER TABLE race_queue DROP CONSTRAINT IF EXISTS race_queue_status_check;

-- Add new constraint with 'matching' included
ALTER TABLE race_queue ADD CONSTRAINT race_queue_status_check 
  CHECK (status IN ('waiting', 'matching', 'matched', 'cancelled'));

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'race_queue'::regclass 
  AND conname = 'race_queue_status_check';
