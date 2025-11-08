-- Clean up stuck queue entries
DELETE FROM race_queue WHERE status IN ('matching', 'matched') OR joined_at < NOW() - INTERVAL '10 minutes';

-- View current queue
SELECT id, player_id, status, joined_at FROM race_queue ORDER BY joined_at;
