-- Clean up duplicate horses (keep only the most recent one per player+name)

-- First, see how many duplicates you have
SELECT player_id, name, COUNT(*) as count
FROM horses
GROUP BY player_id, name
HAVING COUNT(*) > 1;

-- Delete all but the most recent horse for each player+name combo
DELETE FROM horses
WHERE id NOT IN (
  SELECT DISTINCT ON (player_id, name) id
  FROM horses
  ORDER BY player_id, name, created_at DESC
);

-- Verify cleanup
SELECT player_id, name, COUNT(*) as count
FROM horses
GROUP BY player_id, name
ORDER BY count DESC;
