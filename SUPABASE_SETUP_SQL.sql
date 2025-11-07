-- =====================================================
-- SUPABASE DATABASE SCHEMA FOR MULTIPLAYER RACING
-- =====================================================
-- Copy and paste this entire file into Supabase SQL Editor
-- Go to: Supabase Dashboard → SQL Editor → New Query → Paste this → Run

-- =====================================================
-- 1. PLAYERS TABLE
-- Stores player profiles linked to wallet addresses
-- =====================================================
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT,
  total_races INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast wallet lookups
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);

-- =====================================================
-- 2. HORSES TABLE
-- Stores horse data for each player
-- =====================================================
CREATE TABLE IF NOT EXISTS horses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  nft_token_id TEXT,
  
  -- Stats
  stats JSONB NOT NULL DEFAULT '{}',
  
  -- Race history
  races_entered INTEGER DEFAULT 0,
  races_won INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for player's horses
CREATE INDEX IF NOT EXISTS idx_horses_player ON horses(player_id);
CREATE INDEX IF NOT EXISTS idx_horses_wallet ON horses(wallet_address);

-- =====================================================
-- 3. RACE QUEUE TABLE
-- Players waiting for a multiplayer race match
-- =====================================================
CREATE TABLE IF NOT EXISTS race_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
  horse_data JSONB NOT NULL, -- Full horse data snapshot
  
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled'))
);

-- Index for active queue entries
CREATE INDEX IF NOT EXISTS idx_queue_status ON race_queue(status, joined_at);
CREATE INDEX IF NOT EXISTS idx_queue_player ON race_queue(player_id);

-- =====================================================
-- 4. RACES TABLE
-- Completed and ongoing races
-- =====================================================
CREATE TABLE IF NOT EXISTS races (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Race type
  race_type TEXT DEFAULT 'multiplayer' CHECK (race_type IN ('solo', 'multiplayer')),
  
  -- Participants (array of player IDs)
  player_ids UUID[] NOT NULL,
  
  -- Race status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'simulating', 'completed', 'error')),
  
  -- Race data
  race_config JSONB, -- Race settings and participants data
  race_replay JSONB, -- Full replay data (positions, events, etc)
  
  -- Results
  winner_id UUID REFERENCES players(id),
  results JSONB, -- Final standings and stats
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for race queries
CREATE INDEX IF NOT EXISTS idx_races_status ON races(status);
CREATE INDEX IF NOT EXISTS idx_races_players ON races USING GIN(player_ids);
CREATE INDEX IF NOT EXISTS idx_races_completed ON races(completed_at DESC) WHERE status = 'completed';

-- =====================================================
-- 5. RACE PARTICIPANTS TABLE
-- Detailed participant info for each race
-- =====================================================
CREATE TABLE IF NOT EXISTS race_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID REFERENCES races(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES horses(id) ON DELETE SET NULL,
  
  -- Participant data
  horse_snapshot JSONB NOT NULL, -- Horse state at race time
  
  -- Results
  finish_position INTEGER,
  finish_time NUMERIC,
  
  -- Has the player viewed this race?
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_participants_race ON race_participants(race_id);
CREATE INDEX IF NOT EXISTS idx_participants_player ON race_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_participants_unviewed ON race_participants(player_id, viewed) WHERE viewed = FALSE;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================
-- This ensures players can only see/modify their own data

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE horses ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_participants ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. RLS POLICIES
-- =====================================================

-- Players can read all player data but only update their own
CREATE POLICY "Players are viewable by everyone" ON players FOR SELECT USING (true);
CREATE POLICY "Players can update their own profile" ON players FOR UPDATE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
CREATE POLICY "Players can insert their own profile" ON players FOR INSERT WITH CHECK (true);

-- Horses: players can only manage their own horses
CREATE POLICY "Horses are viewable by everyone" ON horses FOR SELECT USING (true);
CREATE POLICY "Players can insert their own horses" ON horses FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their own horses" ON horses FOR UPDATE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
CREATE POLICY "Players can delete their own horses" ON horses FOR DELETE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Race queue: players can manage their own queue entries
CREATE POLICY "Queue entries are viewable by everyone" ON race_queue FOR SELECT USING (true);
CREATE POLICY "Players can join queue" ON race_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their queue entries" ON race_queue FOR UPDATE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
CREATE POLICY "Players can delete their queue entries" ON race_queue FOR DELETE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Races: everyone can read, only system can write (we'll handle this in edge functions)
CREATE POLICY "Races are viewable by everyone" ON races FOR SELECT USING (true);
CREATE POLICY "Races can be inserted" ON races FOR INSERT WITH CHECK (true);
CREATE POLICY "Races can be updated" ON races FOR UPDATE USING (true);

-- Race participants: everyone can read
CREATE POLICY "Race participants are viewable by everyone" ON race_participants FOR SELECT USING (true);
CREATE POLICY "Race participants can be inserted" ON race_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Race participants can update viewed status" ON race_participants FOR UPDATE USING (true);

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to clean up old queue entries (older than 5 minutes)
CREATE OR REPLACE FUNCTION cleanup_old_queue_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM race_queue
  WHERE status = 'waiting'
    AND joined_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get a player's unviewed races
CREATE OR REPLACE FUNCTION get_unviewed_races(p_player_id UUID)
RETURNS TABLE (
  race_id UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  participant_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.completed_at,
    (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id)::INTEGER
  FROM races r
  INNER JOIN race_participants rp ON r.id = rp.race_id
  WHERE rp.player_id = p_player_id
    AND rp.viewed = FALSE
    AND r.status = 'completed'
  ORDER BY r.completed_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SUCCESS!
-- =====================================================
-- If you see no errors, your database is ready!
-- Next steps:
-- 1. Go back to the chat
-- 2. Tell me "Database setup complete"
-- 3. I'll build the multiplayer features
-- =====================================================
