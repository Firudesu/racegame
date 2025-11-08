-- Add missing columns to races table for multiplayer functionality

-- Add race_distance column
ALTER TABLE races ADD COLUMN IF NOT EXISTS race_distance INTEGER DEFAULT 1600;

-- Add race_type column if missing
ALTER TABLE races ADD COLUMN IF NOT EXISTS race_type TEXT DEFAULT 'solo';

-- Add winner_id column if missing
ALTER TABLE races ADD COLUMN IF NOT EXISTS winner_id UUID;

-- Add completed_at column if missing
ALTER TABLE races ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Verify the schema
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'races'
ORDER BY ordinal_position;
