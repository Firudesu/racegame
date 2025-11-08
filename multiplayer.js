// =====================================================
// MULTIPLAYER SYSTEM FOR PROJECT STRIDE
// =====================================================
// Handles race queue, matchmaking, and race replays

(() => {
  'use strict';

  // Initialize Supabase client
  let supabase = null;
  
  // Multiplayer state
  const multiplayerState = {
    inQueue: false,
    queueEntryId: null,
    currentPlayer: null,
    unviewedRaces: [],
    matchCheckInterval: null
  };

  // =====================================================
  // INITIALIZATION
  // =====================================================

  function initMultiplayer() {
    console.log('[Multiplayer] Initializing...');
    
    // Initialize Supabase
    if (typeof window.initSupabase === 'function') {
      supabase = window.initSupabase();
      if (!supabase) {
        console.error('[Multiplayer] Failed to initialize Supabase');
        return false;
      }
    } else {
      console.error('[Multiplayer] Supabase config not loaded');
      return false;
    }

    // Set up UI listeners
    setupMultiplayerUI();
    
    console.log('[Multiplayer] ✅ Ready');
    return true;
  }

  // =====================================================
  // UI SETUP
  // =====================================================

  function setupMultiplayerUI() {
    // We'll add multiplayer buttons to the race screen
    const raceScreen = document.getElementById('race-screen');
    if (!raceScreen) return;

    // Check if multiplayer UI already exists
    if (document.getElementById('multiplayer-race-options')) return;

    // Find the race controls section
    const raceControls = raceScreen.querySelector('.race-controls');
    if (!raceControls) return;

    // Create multiplayer options
    const multiplayerDiv = document.createElement('div');
    multiplayerDiv.id = 'multiplayer-race-options';
    multiplayerDiv.className = 'multiplayer-options';
    multiplayerDiv.innerHTML = `
      <div class="race-type-selector">
        <h3 style="margin-top: 0; margin-bottom: 16px; color: var(--accent);">🏁 Race Type</h3>
        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
          <button id="solo-race-btn" class="race-type-btn primary">
            Solo Race
            <small style="display: block; font-size: 0.85em; opacity: 0.9;">Race against AI</small>
          </button>
          <button id="multiplayer-race-btn" class="race-type-btn secondary">
            Multiplayer Race
            <small style="display: block; font-size: 0.85em; opacity: 0.9;">Race vs Real Players</small>
          </button>
        </div>
        
        <!-- Queue Status (hidden by default) -->
        <div id="queue-status" style="display: none; padding: 16px; background: rgba(0, 212, 255, 0.1); border-radius: 12px; border: 2px solid rgba(0, 212, 255, 0.3); margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 4px;">⏳ Finding Opponent...</div>
              <div style="font-size: 0.9em; opacity: 0.8;">Waiting for another player to join</div>
            </div>
            <button id="leave-queue-btn" class="danger small">Leave Queue</button>
          </div>
        </div>

        <!-- Unviewed Races Notification -->
        <div id="unviewed-races" style="display: none; padding: 16px; background: rgba(255, 159, 67, 0.15); border-radius: 12px; border: 2px solid rgba(255, 159, 67, 0.5); margin-bottom: 16px;">
          <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 8px;">🎬 Race Results Available!</div>
          <div id="unviewed-races-list" style="margin-bottom: 12px;"></div>
          <button id="view-race-results-btn" class="primary">View Results</button>
        </div>
      </div>
    `;

    // Insert before the existing start race button
    raceControls.insertBefore(multiplayerDiv, raceControls.firstChild);

    // Hide original start race button (we'll control when to show it)
    const originalStartBtn = document.getElementById('start-race');
    if (originalStartBtn) {
      originalStartBtn.style.display = 'none';
    }

    // Add event listeners
    const soloBtn = document.getElementById('solo-race-btn');
    const multiBtn = document.getElementById('multiplayer-race-btn');
    const leaveQueueBtn = document.getElementById('leave-queue-btn');

    if (soloBtn) {
      soloBtn.addEventListener('click', handleSoloRace);
    }

    if (multiBtn) {
      multiBtn.addEventListener('click', handleMultiplayerRace);
    }

    if (leaveQueueBtn) {
      leaveQueueBtn.addEventListener('click', leaveQueue);
    }

    const viewResultsBtn = document.getElementById('view-race-results-btn');
    if (viewResultsBtn) {
      viewResultsBtn.addEventListener('click', showRaceResults);
    }

    console.log('[Multiplayer] UI setup complete');
    
    // Check for unviewed races on load
    checkForUnviewedRaces();
  }

  // =====================================================
  // SOLO RACE (Existing functionality)
  // =====================================================

  function handleSoloRace() {
    console.log('[Multiplayer] Starting solo race');
    
    // Trigger the existing race start logic
    const startRaceBtn = document.getElementById('start-race');
    if (startRaceBtn) {
      startRaceBtn.click();
    }
  }

  // =====================================================
  // MULTIPLAYER RACE QUEUE
  // =====================================================

  async function handleMultiplayerRace() {
    console.log('[Multiplayer] Joining multiplayer queue');

    // Check if already in queue
    if (multiplayerState.inQueue) {
      console.log('[Multiplayer] Already in queue, ignoring duplicate click');
      return;
    }

    // Check if user has a wallet connected
    const walletState = window.walletState || {};
    const walletAddress = walletState.address || localStorage.getItem('projectStrideWallet');
    
    if (!walletAddress) {
      alert('⚠️ Please connect your MetaMask wallet first!');
      return;
    }

    // Check if user has selected a horse
    const selectedHorse = getSelectedHorse();
    if (!selectedHorse) {
      alert('⚠️ Please select a horse from the Paddock first!');
      return;
    }

    try {
      // Get or create player profile
      const player = await getOrCreatePlayer(walletAddress);
      multiplayerState.currentPlayer = player;

      // Check if this player already has a queue entry
      const existingEntry = await checkExistingQueueEntry(player.id);
      if (existingEntry) {
        console.log('[Multiplayer] Already in queue, reusing existing entry');
        multiplayerState.inQueue = true;
        multiplayerState.queueEntryId = existingEntry.id;
        showQueueStatus();
        startMatchChecking();
        return;
      }

      // Save horse to database if not already there
      const horse = await saveHorseToDatabase(selectedHorse, player.id, walletAddress);

      // Join the queue
      await joinRaceQueue(player.id, walletAddress, horse);

      // Show queue status
      showQueueStatus();

      // Start checking for matches
      startMatchChecking();

    } catch (error) {
      console.error('[Multiplayer] Error joining queue:', error);
      alert('Failed to join multiplayer queue. Please try again.');
    }
  }

  async function checkExistingQueueEntry(playerId) {
    try {
      const { data, error } = await supabase
        .from('race_queue')
        .select('*')
        .eq('player_id', playerId)
        .eq('status', 'waiting')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[Multiplayer] Error checking existing queue entry:', error);
      return null;
    }
  }

  async function joinRaceQueue(playerId, walletAddress, horse) {
    console.log('[Multiplayer] Joining race queue...');

    // Prepare horse data snapshot
    const horseData = {
      id: horse.id,
      name: horse.name,
      image_url: horse.image_url,
      stats: horse.stats,
      nft_token_id: horse.nft_token_id
    };

    // Insert into queue
    const { data, error } = await supabase
      .from('race_queue')
      .insert({
        player_id: playerId,
        wallet_address: walletAddress,
        horse_id: horse.id,
        horse_data: horseData,
        status: 'waiting'
      })
      .select()
      .single();

    if (error) throw error;

    multiplayerState.inQueue = true;
    multiplayerState.queueEntryId = data.id;

    console.log('[Multiplayer] ✅ Joined queue:', data.id);
    return data;
  }

  async function leaveQueue() {
    if (!multiplayerState.queueEntryId) return;

    try {
      // Delete queue entry
      const { error } = await supabase
        .from('race_queue')
        .delete()
        .eq('id', multiplayerState.queueEntryId);

      if (error) throw error;

      // Clean up state
      multiplayerState.inQueue = false;
      multiplayerState.queueEntryId = null;
      
      // Stop checking for matches
      if (multiplayerState.matchCheckInterval) {
        clearInterval(multiplayerState.matchCheckInterval);
        multiplayerState.matchCheckInterval = null;
      }

      // Hide queue status
      hideQueueStatus();

      console.log('[Multiplayer] Left queue');
      
    } catch (error) {
      console.error('[Multiplayer] Error leaving queue:', error);
    }
  }

  function showQueueStatus() {
    const queueStatus = document.getElementById('queue-status');
    const multiBtn = document.getElementById('multiplayer-race-btn');
    
    if (queueStatus) {
      queueStatus.style.display = 'block';
    }
    
    // Disable multiplayer button while in queue
    if (multiBtn) {
      multiBtn.disabled = true;
      multiBtn.style.opacity = '0.5';
      multiBtn.style.cursor = 'not-allowed';
    }
  }

  function hideQueueStatus() {
    const queueStatus = document.getElementById('queue-status');
    const multiBtn = document.getElementById('multiplayer-race-btn');
    
    if (queueStatus) {
      queueStatus.style.display = 'none';
    }
    
    // Re-enable multiplayer button
    if (multiBtn) {
      multiBtn.disabled = false;
      multiBtn.style.opacity = '1';
      multiBtn.style.cursor = 'pointer';
    }
  }

  // =====================================================
  // MATCHMAKING
  // =====================================================

  function startMatchChecking() {
    // Add a small random delay to prevent all clients from checking at exactly the same time
    const randomDelay = Math.random() * 1000; // 0-1 second random delay
    
    console.log(`[Multiplayer] Starting match checking in ${randomDelay.toFixed(0)}ms...`);
    
    setTimeout(() => {
      // Check for matches every 3 seconds
      multiplayerState.matchCheckInterval = setInterval(checkForMatch, 3000);
      
      // Also check immediately (after the initial random delay)
      checkForMatch();
    }, randomDelay);
  }

  async function checkForMatch() {
    if (!multiplayerState.inQueue) return;

    try {
      // First check if our queue entry still exists
      const { data: myEntry, error: checkError } = await supabase
        .from('race_queue')
        .select('*')
        .eq('id', multiplayerState.queueEntryId)
        .maybeSingle();

      if (checkError) throw checkError;

      // If our entry is gone or matched, the race must have started!
      if (!myEntry || myEntry.status === 'matching' || myEntry.status === 'matched') {
        console.log('[Multiplayer] 🎉 Queue entry matched! Checking for race results...');
        await handleRaceStarted();
        return;
      }

      // Get all waiting players in queue
      const { data: queueEntries, error } = await supabase
        .from('race_queue')
        .select('*')
        .eq('status', 'waiting')
        .order('joined_at', { ascending: true })
        .limit(10);

      if (error) throw error;

      console.log(`[Multiplayer] Queue check: ${queueEntries.length} players waiting`);

      // Need at least 2 players to start a race
      if (queueEntries.length >= 2) {
        // Check if we're one of the first 2
        const myEntryInQueue = queueEntries.find(e => e.id === multiplayerState.queueEntryId);
        const myIndex = queueEntries.findIndex(e => e.id === multiplayerState.queueEntryId);

        if (myIndex === 0) {
          // Only the FIRST player in queue initiates the match
          console.log('[Multiplayer] 🎉 Match found! You are first - creating race...');
          
          // Atomically claim these players for racing
          const firstTwo = queueEntries.slice(0, 2);
          const claimed = await claimPlayersForRace(firstTwo);
          
          if (claimed) {
            await createMultiplayerRace(firstTwo);
          } else {
            console.log('[Multiplayer] ⚠️ Race already claimed, will recheck queue in next cycle');
            // Don't do anything - let the interval naturally recheck
            // The other client successfully claimed and will start the race
          }
        } else if (myIndex === 1) {
          console.log('[Multiplayer] Waiting for first player to start race...');
        } else {
          console.log('[Multiplayer] Position in queue:', myIndex + 1);
        }
      }

    } catch (error) {
      console.error('[Multiplayer] Error checking for match:', error);
    }
  }

  async function handleRaceStarted() {
    console.log('[Multiplayer] Detected race started! Fetching results...');
    
    try {
      // Stop checking for matches
      if (multiplayerState.matchCheckInterval) {
        clearInterval(multiplayerState.matchCheckInterval);
        multiplayerState.matchCheckInterval = null;
      }

      // Clean up our queue state
      multiplayerState.inQueue = false;
      multiplayerState.queueEntryId = null;
      hideQueueStatus();

      // Wait a moment for Player 1 to finish creating the race
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find the most recent race involving our player
      const { data: recentRaces, error } = await supabase
        .from('races')
        .select('*')
        .contains('player_ids', [multiplayerState.currentPlayer.id])
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (recentRaces && recentRaces.length > 0) {
        const race = recentRaces[0];
        console.log('[Multiplayer] Found race:', race.id);
        
        // Show the race results
        await showRaceReplay(race.id, race);
      } else {
        console.log('[Multiplayer] No race found yet, showing notification...');
        showNotification('🏁 Race completed! Check back in a moment.');
      }

    } catch (error) {
      console.error('[Multiplayer] Error handling race start:', error);
    }
  }

  async function claimPlayersForRace(queueEntries) {
    try {
      // Try to atomically update both entries to "matching" status
      // This prevents race conditions where multiple clients try to match the same players
      
      const ids = queueEntries.map(e => e.id);
      console.log('[Multiplayer] Attempting to claim players:', ids);
      
      // First, check current status of these entries
      const { data: checkData } = await supabase
        .from('race_queue')
        .select('*')
        .in('id', ids);
      
      console.log('[Multiplayer] Current entries before claim:', checkData);
      
      // Count how many are actually waiting
      const waitingCount = checkData?.filter(e => e.status === 'waiting').length || 0;
      console.log('[Multiplayer] Entries with status=waiting:', waitingCount);
      
      if (waitingCount !== 2) {
        console.log('[Multiplayer] Not all entries are waiting, aborting claim');
        return false;
      }
      
      // Try updating each one individually to see which fails
      let claimedCount = 0;
      const claimedIds = [];
      
      for (const id of ids) {
        const { data: updateData, error: updateError } = await supabase
          .from('race_queue')
          .update({ status: 'matching' })
          .eq('id', id)
          .eq('status', 'waiting')
          .select();
        
        if (!updateError && updateData && updateData.length > 0) {
          claimedCount++;
          claimedIds.push(id);
          console.log('[Multiplayer] ✅ Claimed player:', id);
        } else {
          console.log('[Multiplayer] ❌ Failed to claim player:', id, updateError);
        }
      }

      console.log('[Multiplayer] Total claimed:', claimedCount, '/', ids.length);

      // Check if we successfully claimed both players
      if (claimedCount === 2) {
        console.log('[Multiplayer] ✅ Successfully claimed both players for race');
        return true;
      } else {
        console.log('[Multiplayer] ⚠️ Could only claim', claimedCount, 'players (expected 2)');
        
        // Rollback partial claims
        if (claimedCount > 0) {
          console.log('[Multiplayer] Rolling back partial claim...');
          for (const id of claimedIds) {
            await supabase
              .from('race_queue')
              .update({ status: 'waiting' })
              .eq('id', id);
          }
        }
        
        return false;
      }

    } catch (error) {
      console.error('[Multiplayer] Error in claimPlayersForRace:', error);
      return false;
    }
  }

  async function createMultiplayerRace(queueEntries) {
    try {
      console.log('[Multiplayer] Creating race with', queueEntries.length, 'players');

      // Start the race simulation (this will handle queue cleanup)
      await startMultiplayerRaceSimulation(queueEntries);

      // Stop checking for more matches (after race is created)
      if (multiplayerState.matchCheckInterval) {
        clearInterval(multiplayerState.matchCheckInterval);
        multiplayerState.matchCheckInterval = null;
      }

      // Clean up our queue state
      multiplayerState.inQueue = false;
      multiplayerState.queueEntryId = null;
      hideQueueStatus();

    } catch (error) {
      console.error('[Multiplayer] Error creating race:', error);
      
      // Reset queue entries back to waiting on error
      for (const entry of queueEntries) {
        await supabase
          .from('race_queue')
          .update({ status: 'waiting' })
          .eq('id', entry.id);
      }
      
      alert('Failed to create multiplayer race. Please try again.');
    }
  }

  async function startMultiplayerRaceSimulation(queueEntries) {
    console.log('[Multiplayer] Starting race simulation...');
    
    // Show notification
    showNotification('🏁 Race starting! Simulating...');

    try {
      // Simulate race first
      const raceResults = simulateRace(queueEntries);
      
      // Extract player IDs
      const playerIds = queueEntries.map(e => e.player_id);
      
      // Create race record with all data
      const { data: race, error: raceError } = await supabase
        .from('races')
        .insert({
          race_type: 'multiplayer',
          player_ids: playerIds,
          status: 'completed', // Race is already simulated
          race_config: {
            distance: 1600,
            participants: queueEntries.map(e => ({
              player_id: e.player_id,
              horse_id: e.horse_id,
              horse_name: e.horse_data.name
            }))
          },
          race_replay: raceResults.replayData,
          winner_id: raceResults.winnerId,
          results: raceResults.results,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (raceError) {
        console.error('[Multiplayer] Error creating race:', raceError);
        throw raceError;
      }

      console.log('[Multiplayer] Created race record:', race.id);

      // Save race participants
      for (let i = 0; i < queueEntries.length; i++) {
        const entry = queueEntries[i];
        const result = raceResults.results[i];
        
        await supabase
          .from('race_participants')
          .insert({
            race_id: race.id,
            player_id: entry.player_id,
            horse_id: entry.horse_id,
            finish_position: result.position,
            finish_time: result.time,
            viewed: entry.player_id === multiplayerState.currentPlayer?.id // Mark as viewed for current player
          });
      }

      console.log('[Multiplayer] ✅ Race completed and saved');

      // Show results immediately for current player
      showRaceReplay(race.id, raceResults);

      // Clean up queue entries
      for (const entry of queueEntries) {
        await supabase
          .from('race_queue')
          .delete()
          .eq('id', entry.id);
      }

    } catch (error) {
      console.error('[Multiplayer] Error simulating race:', error);
      alert('Failed to complete race. Please try again.');
    }
  }

  function simulateRace(queueEntries) {
    console.log('[Multiplayer] Running stats-based race simulation with 2 players + 2 AI...');
    
    // Access the data helpers
    const Data = window.ProjectStrideData;
    if (!Data) {
      console.error('[Multiplayer] ProjectStrideData not loaded!');
      return fallbackRandomRace(queueEntries);
    }

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const seed = Date.now() + Math.random() * 1000;
    const rng = Data.createSeededRng(seed);
    
    // Add 2 AI racers
    const aiRacers = [];
    for (let i = 0; i < 2; i++) {
      const aiHorse = Data.createAIRacer(i, queueEntries[0].horse_data.stats, rng);
      aiRacers.push({
        player_id: null, // AI doesn't have player_id
        horse_id: `ai-${i}`,
        horse_data: {
          name: aiHorse.name,
          stats: aiHorse.stats,
          skills: aiHorse.skills,
          style: aiHorse.style
        },
        isAI: true
      });
    }
    
    // Combine players + AI = 4 total racers
    const allEntries = [...queueEntries, ...aiRacers];
    console.log('[Multiplayer] Racing with:', allEntries.map(e => e.horse_data.name).join(', '));
    
    // Calculate race performance for each horse (INCLUDING SECONDARY STATS!)
    const raceData = allEntries.map((entry, index) => {
      const horseData = entry.horse_data;
      const stats = horseData.stats || {
        stride: 50,
        endurance: 50,
        force: 50,
        resolve: 50,
        insight: 50
      };
      
      // Calculate primary performance
      const speed = clamp(Math.round(stats.stride * 0.65 + stats.force * 0.35), 25, 100);
      const handling = clamp(Math.round(stats.resolve * 0.45 + stats.insight * 0.55), 25, 100);
      const stamina = clamp(Math.round(stats.endurance * 0.7 + stats.resolve * 0.3), 25, 100);
      
      // Calculate SECONDARY stats (the real deal!)
      const secondary = Data.deriveSecondaryStats(stats, {});
      
      // Base time calculation (inversely proportional to speed)
      const baseTime = 180 - speed;
      
      // Stamina affects consistency using secondary fatigueResistance
      const fatigueResist = secondary.fatigueResistance || 60;
      const staminaFactor = 1 - (fatigueResist / 200);
      const variance = (rng() - 0.5) * 20 * staminaFactor;
      
      // Passing power and maneuver affect race time
      const passingBonus = (secondary.passingPower - 60) / 15;
      const maneuverBonus = (secondary.maneuverBase - 60) / 20;
      
      // Pace control affects energy efficiency = faster times
      const paceBonus = (secondary.paceControl - 60) / 18;
      
      // Phase power bonuses
      const phaseBonus = (
        (secondary.phasePower.start - 60) / 30 +
        (secondary.phasePower.middle - 60) / 30 +
        (secondary.phasePower.final - 60) / 25
      );
      
      // Skills provide bonuses
      const skillBonus = (horseData.skills || []).length * 1.5;
      
      // Aggression gives slight edge
      const aggressionBonus = (secondary.aggression - 60) / 25;
      
      // Calculate final time with ALL factors
      const finalTime = Math.max(75, 
        baseTime + 
        variance - 
        passingBonus - 
        maneuverBonus - 
        paceBonus - 
        phaseBonus - 
        skillBonus -
        aggressionBonus
      );
      
      console.log(`[Multiplayer] ${horseData.name}: Speed=${speed}, Passing=${secondary.passingPower}, Pace=${secondary.paceControl}, Time=${finalTime.toFixed(2)}s`);
      
      return {
        playerId: entry.player_id,
        horseId: entry.horse_id,
        horseName: horseData.name,
        time: finalTime,
        position: 0,
        isAI: entry.isAI || false,
        stats: { speed, handling, stamina },
        secondary: secondary,
        skills: horseData.skills || []
      };
    });

    // Sort by time to determine positions
    raceData.sort((a, b) => a.time - b.time);
    raceData.forEach((r, i) => r.position = i + 1);

    console.log('[Multiplayer] 🏁 Final Results:', raceData.map(r => 
      `${r.position}. ${r.horseName}${r.isAI ? ' (AI)' : ''} - ${r.time.toFixed(2)}s`
    ));

    // Only save results for real players (not AI)
    const playerResults = raceData.filter(r => !r.isAI);

    return {
      results: playerResults, // Only player results saved to DB
      allResults: raceData, // Full results including AI for display
      winnerId: playerResults[0].playerId,
      replayData: {
        seed: seed,
        racers: raceData.map((r, idx) => ({
          id: r.isAI ? r.horseId : `mp-${idx}`,
          name: r.horseName,
          color: r.isAI ? '#ff6b6b' : (idx === 0 ? '#64b5f6' : `hsl(${idx * 90}, 70%, 60%)`),
          stats: allEntries.find(e => e.horse_data.name === r.horseName)?.horse_data.stats,
          skills: r.skills,
          finishTime: r.time,
          isAI: r.isAI
        }))
      }
    };
  }

  function fallbackRandomRace(queueEntries) {
    console.warn('[Multiplayer] Using fallback random simulation');
    
    const results = queueEntries.map((entry, index) => {
      const baseTime = 90 + Math.random() * 15;
      return {
        playerId: entry.player_id,
        horseId: entry.horse_id,
        horseName: entry.horse_data.name,
        time: baseTime,
        position: 0
      };
    });

    results.sort((a, b) => a.time - b.time);
    results.forEach((r, i) => r.position = i + 1);

    return {
      results,
      winnerId: results[0].playerId,
      replayData: { frames: [] }
    };
  }

  // =====================================================
  // DATABASE HELPERS
  // =====================================================

  async function getOrCreatePlayer(walletAddress) {
    // Try to get existing player
    let { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Create player if doesn't exist
    if (!player) {
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({
          wallet_address: walletAddress,
          username: `Player ${walletAddress.slice(0, 6)}`
        })
        .select()
        .single();

      if (insertError) throw insertError;
      player = newPlayer;
      console.log('[Multiplayer] ✅ Created new player:', player.id);
    }

    return player;
  }

  async function saveHorseToDatabase(horseData, playerId, walletAddress) {
    // Check if horse already exists
    const horseId = horseData.id || horseData.tokenId || horseData.name;
    
    let { data: horse, error } = await supabase
      .from('horses')
      .select('*')
      .eq('player_id', playerId)
      .eq('name', horseData.name)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 errors

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Create or update horse
    if (!horse) {
      const { data: newHorse, error: insertError } = await supabase
        .from('horses')
        .insert({
          player_id: playerId,
          wallet_address: walletAddress,
          name: horseData.name,
          image_url: horseData.image || horseData.portrait || null,
          nft_token_id: horseData.tokenId || null,
          stats: horseData.stats || {}
        })
        .select()
        .single();

      if (insertError) throw insertError;
      horse = newHorse;
      console.log('[Multiplayer] ✅ Saved horse to database:', horse.id);
    }

    return horse;
  }

  function getSelectedHorse() {
    console.log('[Multiplayer] Getting selected horse...');
    console.log('[Multiplayer] walletState:', window.walletState);
    console.log('[Multiplayer] state.avatar:', window.state?.avatar);
    
    // Try to get selected horse from the existing game state
    if (window.walletState && window.walletState.selectedId) {
      const roster = window.walletState.roster || [];
      const selected = roster.find(h => h.id === window.walletState.selectedId);
      if (selected) {
        console.log('[Multiplayer] ✅ Found selected horse from roster:', selected.name);
        return selected;
      }
    }

    // Fallback: try to get from state.avatar
    if (window.state && window.state.avatar) {
      const horseData = {
        id: window.state.avatar.id || 'avatar-horse',
        name: window.state.avatar.name || 'My Horse',
        stats: window.state.avatar.stats || {},
        image: window.state.avatar.portrait || window.state.avatar.image || 'assets/default_horse.svg',
        portrait: window.state.avatar.portrait || window.state.avatar.image || 'assets/default_horse.svg',
        tokenId: window.state.tokenId || null
      };
      console.log('[Multiplayer] ✅ Found horse from state.avatar:', horseData.name);
      return horseData;
    }

    console.log('[Multiplayer] ❌ No horse found');
    return null;
  }

  // =====================================================
  // RACE REPLAY
  // =====================================================

  async function checkForUnviewedRaces() {
    const walletAddress = localStorage.getItem('projectStrideWallet');
    if (!walletAddress) return;

    try {
      const player = await getOrCreatePlayer(walletAddress);
      
      // Query for unviewed completed races
      const { data: unviewed, error } = await supabase
        .from('race_participants')
        .select(`
          *,
          races!inner(*)
        `)
        .eq('player_id', player.id)
        .eq('viewed', false)
        .eq('races.status', 'completed');

      if (error) throw error;

      if (unviewed && unviewed.length > 0) {
        multiplayerState.unviewedRaces = unviewed;
        showUnviewedRacesNotification(unviewed);
      }

    } catch (error) {
      console.error('[Multiplayer] Error checking unviewed races:', error);
    }
  }

  function showUnviewedRacesNotification(races) {
    const notification = document.getElementById('unviewed-races');
    const list = document.getElementById('unviewed-races-list');
    
    if (!notification || !list) return;

    list.innerHTML = races.map(r => 
      `<div style="padding: 8px 0;">
        <strong>Race #${r.race_id}</strong> - 
        ${r.finish_position === 1 ? '🏆 You WON!' : `Finished ${getOrdinal(r.finish_position)}`}
      </div>`
    ).join('');

    notification.style.display = 'block';
  }

  async function showRaceResults() {
    if (multiplayerState.unviewedRaces.length === 0) return;

    // Show first unviewed race
    const raceParticipant = multiplayerState.unviewedRaces[0];
    const raceId = raceParticipant.race_id;

    try {
      // Get full race data
      const { data: race, error } = await supabase
        .from('races')
        .select('*')
        .eq('id', raceId)
        .single();

      if (error) throw error;

      // Show replay
      await showRaceReplay(raceId, race);

      // Mark as viewed
      await supabase
        .from('race_participants')
        .update({ viewed: true })
        .eq('id', raceParticipant.id);

      // Remove from unviewed list
      multiplayerState.unviewedRaces.shift();

      // Hide notification if no more unviewed races
      if (multiplayerState.unviewedRaces.length === 0) {
        const notification = document.getElementById('unviewed-races');
        if (notification) notification.style.display = 'none';
      }

    } catch (error) {
      console.error('[Multiplayer] Error showing race results:', error);
    }
  }

  async function showRaceReplay(raceId, raceData) {
    console.log('[Multiplayer] Showing race replay:', raceId);
    
    // Create a modal overlay for the replay
    let replayModal = document.getElementById('race-replay-modal');
    
    if (!replayModal) {
      replayModal = document.createElement('div');
      replayModal.id = 'race-replay-modal';
      replayModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
      `;
      document.body.appendChild(replayModal);
    }

    // Use allResults if available (includes AI), otherwise fall back to results
    const results = raceData.allResults || raceData.replayData?.results || raceData.results || [];
    
    replayModal.innerHTML = `
      <div style="max-width: 800px; width: 100%; background: linear-gradient(135deg, rgba(20, 20, 40, 0.95), rgba(40, 40, 80, 0.95)); border-radius: 24px; padding: 40px; border: 3px solid var(--accent);">
        <h2 style="margin: 0 0 30px 0; text-align: center; color: var(--accent); font-size: 2em;">
          🏁 Race Results
        </h2>
        
        <div style="background: rgba(0, 0, 0, 0.3); border-radius: 16px; padding: 24px; margin-bottom: 30px;">
          ${results.map((r, i) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; margin-bottom: 12px; background: ${i === 0 ? 'linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05))' : 'rgba(255, 255, 255, 0.05)'}; border-radius: 12px; border-left: 4px solid ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255, 255, 255, 0.3)'};">
              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="font-size: 2em; font-weight: bold; min-width: 50px; text-align: center;">
                  ${i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </div>
                <div>
                  <div style="font-size: 1.3em; font-weight: bold; margin-bottom: 4px;">
                    ${r.horseName || `Horse ${i + 1}`}${r.isAI ? ' <span style="font-size: 0.8em; opacity: 0.7;">(AI)</span>' : ''}
                  </div>
                  <div style="font-size: 0.9em; opacity: 0.7;">
                    Time: ${r.time ? r.time.toFixed(2) + 's' : 'N/A'}
                  </div>
                </div>
              </div>
              ${r.playerId === multiplayerState.currentPlayer?.id ? '<div style="background: var(--accent); padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 0.9em;">YOU</div>' : ''}
            </div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 16px; justify-content: center;">
          <button id="replay-close-btn" class="primary" style="padding: 16px 32px; font-size: 1.1em;">
            Continue
          </button>
        </div>
      </div>
    `;

    // Add close handler
    const closeBtn = document.getElementById('replay-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        replayModal.remove();
      });
    }
  }

  // =====================================================
  // UTILITIES
  // =====================================================

  function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function showNotification(message) {
    // Simple notification system
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: linear-gradient(135deg, var(--accent), var(--purple));
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // =====================================================
  // EXPORT
  // =====================================================

  window.MultiplayerSystem = {
    init: initMultiplayer,
    joinQueue: handleMultiplayerRace,
    leaveQueue: leaveQueue,
    checkUnviewed: checkForUnviewedRaces,
    getState: () => multiplayerState
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayer);
  } else {
    initMultiplayer();
  }

})();
