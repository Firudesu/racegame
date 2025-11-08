# Clean Up Stuck Queue Entries

Your queue has 6 players stuck in "waiting" status. Here's how to clean it up:

## Option 1: SQL Editor (Quick)

1. Go to Supabase → **SQL Editor**
2. Paste this and run:

```sql
-- Clean up all stuck queue entries
DELETE FROM race_queue WHERE status IN ('matching', 'matched', 'waiting');

-- Verify it's empty
SELECT * FROM race_queue;
```

## Option 2: Browser Console (Alternative)

Open browser console and paste:

```javascript
// Get Supabase client
const sb = window.getSupabaseClient();

// Delete all queue entries
sb.from('race_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  .then(result => console.log('Queue cleaned:', result));
```

---

## After Cleanup, Test Again:

1. **Hard refresh** both browsers (Ctrl+Shift+R)
2. **Player 1** clicks "Multiplayer Race"
3. **Player 2** clicks "Multiplayer Race"
4. Race should start in **3 seconds**!

## What Changed:

✅ **Only the FIRST player** in queue now starts the race
✅ **Atomic locking** prevents race conditions
✅ Player 2 waits for Player 1 to initiate
✅ No more duplicate races or stuck queues

---

## Console Output You Should See:

**Player 1 (First in queue):**
```
[Multiplayer] Queue check: 2 players waiting
[Multiplayer] 🎉 Match found! You are first - creating race...
[Multiplayer] ✅ Successfully claimed both players for race
```

**Player 2 (Second in queue):**
```
[Multiplayer] Queue check: 2 players waiting
[Multiplayer] Waiting for first player to start race...
```

Then both see the race results modal! 🏁
