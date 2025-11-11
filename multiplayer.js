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
    console.log('[Multiplayer] Horse data being queued:', horse);
    console.log('[Multiplayer] horse.stats:', horse.stats);
    console.log('[Multiplayer] horse.avatar:', horse.avatar);
    console.log('[Multiplayer] horse.avatar?.stats:', horse.avatar?.stats);

    // Prepare horse data snapshot - handle ALL possible structures
    // Priority: direct stats > avatar.stats > default
    let stats = {};
    if (horse.stats && Object.keys(horse.stats).length > 0) {
      stats = horse.stats;
      console.log('[Multiplayer] Using direct stats:', JSON.stringify(stats));
    } else if (horse.avatar && horse.avatar.stats && Object.keys(horse.avatar.stats).length > 0) {
      stats = horse.avatar.stats;
      console.log('[Multiplayer] Using avatar.stats:', JSON.stringify(stats));
    } else {
      // FALLBACK: Use default stats if nothing found
      stats = {
        stride: 60,
        endurance: 55,
        force: 48,
        resolve: 42,
        insight: 50
      };
      console.log('[Multiplayer] ⚠️ No stats found, using defaults:', JSON.stringify(stats));
    }
    
    const horseData = {
      id: horse.id,
      name: horse.name,
      image_url: horse.image_url || horse.image || horse.portrait || horse.avatar?.portrait,
      stats: stats,
      skills: horse.avatar?.skills || horse.skills || [],
      style: horse.avatar?.style || horse.style || 'Pacer',
      aptitudes: horse.avatar?.aptitudes || horse.aptitudes || {},
      nft_token_id: horse.nft_token_id || horse.tokenId
    };
    
    console.log('[Multiplayer] Formatted horse_data with stats:', JSON.stringify(horseData.stats));

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

      // Find MY NEWEST race (created in last 30 seconds)
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      const { data: participants, error } = await supabase
        .from('race_participants')
        .select('race_id, viewed, created_at, races(*)')
        .eq('player_id', multiplayerState.currentPlayer.id)
        .eq('viewed', false)
        .gte('created_at', thirtySecondsAgo) // Only races from last 30s!
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (participants && participants.length > 0) {
        const participant = participants[0];
        const raceData = participant.races;
        const raceId = raceData.id;
        
        console.log('[Multiplayer] Found MY unviewed race:', raceId);
        console.log('[Multiplayer] Race created:', participant.created_at);
        console.log('[Multiplayer] Race has frames:', raceData.race_replay?.frames?.length || 0);
        
        // Mark as viewed
        await supabase
          .from('race_participants')
          .update({ viewed: true })
          .eq('player_id', multiplayerState.currentPlayer.id)
          .eq('race_id', raceId);
        
        // Show the race results
        await showRaceReplay(raceId, raceData);
      } else {
        console.log('[Multiplayer] No recent unviewed race found, waiting...');
        // Retry after 2 seconds
        setTimeout(() => handleRaceStarted(), 2000);
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
      // Simulate race first with FULL mechanics
      const raceResults = simulateRace(queueEntries);
      
      console.log(`[Multiplayer] 🎬 Simulation complete! Frames captured: ${raceResults.replayData?.frames?.length || 0}`);
      
      // Extract player IDs
      const playerIds = queueEntries.map(e => e.player_id);
      
      // Create race record with all data (including AI results AND FRAMES!)
      console.log(`[Multiplayer] 💾 Saving race with ${raceResults.replayData?.frames?.length || 0} frames to database...`);
      
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
          race_replay: raceResults.replayData,  // THIS MUST SAVE FRAMES!
          winner_id: raceResults.winnerId,
          results: raceResults.allResults, // Save ALL results including AI!
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (raceError) {
        console.error('[Multiplayer] ❌ Error saving race:', raceError);
        console.error('[Multiplayer] ❌ Error details:', JSON.stringify(raceError));
      } else {
        console.log(`[Multiplayer] ✅ Race saved! Verifying frames in DB: ${race.race_replay?.frames?.length || 0} frames`);
      }

      if (raceError) {
        console.error('[Multiplayer] Error creating race:', raceError);
        throw raceError;
      }

      console.log('[Multiplayer] Created race record:', race.id);

      // Save race participants (only real players, not AI)
      for (let i = 0; i < raceResults.results.length; i++) {
        const result = raceResults.results[i];
        
        // Skip AI racers (they don't have player_id)
        if (!result.playerId) continue;
        
        // Find the original queue entry to get full horse data
        const queueEntry = queueEntries.find(e => e.player_id === result.playerId);
        
        const participantData = {
          race_id: race.id,
          player_id: result.playerId,
          horse_id: result.horseId,
          horse_snapshot: queueEntry ? queueEntry.horse_data : {
            name: result.horseName,
            stats: result.stats || {}
          },
          finish_position: result.position,
          finish_time: result.time,
          viewed: result.playerId === multiplayerState.currentPlayer?.id
        };
        
        console.log('[Multiplayer] Saving participant:', participantData);
        
        const { error: participantError } = await supabase
          .from('race_participants')
          .insert(participantData);
        
        if (participantError) {
          console.error('[Multiplayer] ❌ Error saving participant for', result.horseName);
          console.error('[Multiplayer] Error details:', JSON.stringify(participantError));
          console.error('[Multiplayer] Failed data:', participantData);
        } else {
          console.log('[Multiplayer] ✅ Saved participant for', result.horseName);
        }
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

  function getStyleMultiplier(style, progress) {
    // progress: 0-1 (0 = start, 1 = finish)
    if (progress < 0.25) { // Start phase
      if (style === 'Leader') return 1.15;
      return 1.0;
    } else if (progress < 0.8) { // Middle phase
      if (style === 'Pacer') return 1.05;
      return 1.0;
    } else { // Final phase
      if (style === 'Chaser') return 1.20;
      if (style === 'Sprinter') return 1.18;
      return 1.0;
    }
  }

  function simulateRace(queueEntries) {
    console.log('[Multiplayer] Running FULL race simulation with 2 players + 2 AI...');
    
    // Access the data helpers and race simulation
    const Data = window.ProjectStrideData;
    const RaceSim = window.RaceSimulation;
    
    if (!Data || !RaceSim) {
      console.error('[Multiplayer] Required modules not loaded!');
      return fallbackRandomRace(queueEntries);
    }

    const clamp = Data.clamp;
    const seed = Date.now() + Math.random() * 1000;
    const rng = Data.createSeededRng(seed);
    
    // Generate track conditions for this race (same as single-player)
    const trackConditions = generateMultiplayerTrackConditions();
    console.log('[Multiplayer] Track Conditions:', trackConditions);
    
    // Set global track conditions so buildRacer can use them
    if (typeof window.state !== 'undefined') {
      window.state.currentTrackConditions = trackConditions;
    }
    
    // Build racers using FULL race engine
    const racers = [];
    
    // Build player racers
    queueEntries.forEach((entry, index) => {
      const horseData = entry.horse_data;
      
      const stats = {
        stride: Number(horseData.stats?.stride) || 50,
        endurance: Number(horseData.stats?.endurance) || 50,
        force: Number(horseData.stats?.force) || 50,
        resolve: Number(horseData.stats?.resolve) || 50,
        insight: Number(horseData.stats?.insight) || 50
      };
      
      const profile = Data.buildRacingProfile(stats, {});
      const secondary = Data.deriveSecondaryStats(stats, {}, profile.aptitudes);
      
      // Add secondary to profile
      profile.secondary = secondary;
      
      const racer = RaceSim.buildRacer({
        id: `mp-player-${index}`,
        name: horseData.name,
        color: index === 0 ? '#64b5f6' : '#7b61ff',
        stats: stats,
        skills: horseData.skills || [],
        modifiers: {},
        isPlayer: false, // All are AI-controlled in headless sim
        style: horseData.style || 'Pacer',
        mood: 70,
        performance: profile.performance,
        profile: profile,
        aptitudes: profile.aptitudes
      });
      
      console.log(`[Multiplayer] ${horseData.name} secondary stats:`, secondary);
      
      racer.playerId = entry.player_id;
      racer.horseId = entry.horse_id;
      racer.isRealPlayer = true;
      racers.push(racer);
    });
    
    // Build AI racers
    for (let i = 0; i < 2; i++) {
      const aiHorse = Data.createAIRacer(i, queueEntries[0].horse_data.stats, rng);
      
      const racer = RaceSim.buildRacer({
        id: `mp-ai-${i}`,
        name: aiHorse.name,
        color: i === 0 ? '#ff6b6b' : '#ffa500',
        stats: aiHorse.stats,
        skills: aiHorse.skills,
        modifiers: aiHorse.modifiers || {},
        isPlayer: false,
        style: aiHorse.style || 'Pacer',
        mood: aiHorse.mood || 70,
        performance: aiHorse.performance,
        profile: aiHorse.profile,
        aptitudes: aiHorse.aptitudes
      });
      
      racer.isAI = true;
      racers.push(racer);
    }
    
    console.log('[Multiplayer] Built', racers.length, 'racers:', racers.map(r => `${r.name} (${r.style})`).join(', '));
    
    // Apply race adjustments
    racers.forEach(racer => {
      racer.startAggro = rng();
      const decisionFactor = clamp(racer.zoneDecisionFactorBase || 1, 0.5, 1.3);
      racer.strategyCooldown = (0.3 + rng() * 0.5) * decisionFactor;
      RaceSim.applyRacePerformanceAdjustments(racer, rng);
      
      // Track conditions are already applied in buildRacer() via state.currentTrackConditions
      // No need to reapply here!
      console.log(`[Multiplayer] ${racer.name} ready - Base Speed: ${racer.baseSpeed.toFixed(3)}, Drain: ${racer.baseDrain.toFixed(3)}/s`);
    });
    
    // Lanes are already assigned randomly in buildRacer()
    // RaceSim.assignInitialLanes(racers);
    
    // Create race state
    const race = {
      seed: seed,
      rng: rng,
      racers: racers,
      time: 0,
      running: true,
      finishedOrder: [],
      leaderboard: racers.slice()
    };
    
    console.log('[Multiplayer] Starting FULL headless simulation using single-player engine...');
    
    // Use the EXACT same engine as single-player!
    const TRACK_STEP = RaceSim.TRACK_STEP;
    const TRACK_LENGTH = RaceSim.TRACK_LENGTH;
    const MAX_RACE_TIME = 300; // 5 minutes max
    const frames = []; // Capture replay data
    
    // Add track conditions to race object
    race.trackConditions = trackConditions;
    race.trackLength = TRACK_LENGTH;
    
    let frameCounter = 0;
    const MAX_ITERATIONS = 10000; // Safety limit: 10k frames max
    
    while (race.time < MAX_RACE_TIME && frameCounter < MAX_ITERATIONS) {
      // Check if all finished
      const unfinished = race.racers.filter(r => !r.finished);
      if (unfinished.length === 0) {
        console.log(`[Multiplayer] All racers finished at ${race.time.toFixed(1)}s`);
        break;
      }
      
      // Safety check: Log progress every 1000 frames
      if (frameCounter % 1000 === 0 && frameCounter > 0) {
        console.log(`[Multiplayer] Simulation progress: ${race.time.toFixed(1)}s, ${unfinished.length} still racing...`);
      }
      
      // USE FULL SINGLE-PLAYER MECHANICS!
      RaceSim.decideZoneTargets(race, TRACK_STEP);
      
      race.racers.forEach(racer => {
        if (!racer.finished) {
          RaceSim.stepRacer(racer, TRACK_STEP, race);
          
          // Check if finished
          if (racer.distance >= TRACK_LENGTH && !racer.finished) {
            racer.finished = true;
            racer.finishTime = race.time;
            const finalEnergy = Math.round((racer.energy / racer.maxEnergy) * 100);
            racer.energyHistory = racer.energyHistory || [];
            racer.energyHistory.push({ time: race.time, energy: finalEnergy });
            race.finishedOrder.push(racer);
            console.log(`[Multiplayer] 🏁 ${racer.name} finished in ${racer.finishTime.toFixed(2)}s with ${finalEnergy}% energy`);
          }
        }
      });
      
      // Handle passing (overtaking mechanics)
      RaceSim.handlePassing(race, TRACK_STEP);
      
      // Update leaderboard
      race.leaderboard = [...race.racers].sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.distance - a.distance;
      });
      
      // Capture COMPLETE race state every frame (for perfect replay!)
      if (frameCounter % 2 === 0) { // Every 2 steps = 10fps replay
        frames.push({
          time: race.time,
          leaderboard: race.leaderboard.map(r => ({ id: r.id, distance: r.distance })),
          racers: race.racers.map(r => ({
            // Core identity
            id: r.id,
            name: r.name,
            color: r.color,
            isPlayer: r.isPlayer,
            isRealPlayer: r.isRealPlayer,
            
            // Position and movement
            distance: r.distance || 0,
            speed: r.speed || 0,
            finished: r.finished || false,
            finishTime: r.finishTime || null,
            
            // Stamina and phase
            energy: r.energy || 0,
            maxEnergy: r.maxEnergy || 650,
            phase: r.phase || 'start',
            
            // Lane and zone
            lane: r.lane || 0,
            zoneIndex: r.zoneIndex || 0,
            zoneOffset: r.zoneOffset || 0,
            
            // Style and skills
            style: r.style || 'Pacer',
            sprintMode: r.sprintMode || false,
            skills: (r.skills || []).filter(s => s.active).map(s => ({ name: s.name, timer: s.timer }))
          }))
        });
      }
      
      race.time += TRACK_STEP;
      frameCounter++;
    }
    
    if (frameCounter >= MAX_ITERATIONS) {
      console.error(`[Multiplayer] ⚠️ Simulation hit max iterations! Forcing finish...`);
      // Force finish any remaining racers
      race.racers.forEach(r => {
        if (!r.finished) {
          r.finished = true;
          r.finishTime = race.time;
          race.finishedOrder.push(r);
        }
      });
    }
    
    console.log('[Multiplayer] ✅ Simulation complete! Race time:', race.time.toFixed(2), 'seconds');
    console.log('[Multiplayer] ✅ Total frames:', frameCounter, '| Replay frames captured:', frames.length);
    console.log('[Multiplayer] ✅ Finished order:', race.finishedOrder.map(r => r.name).join(', '));
    
    // Collect results
    const allResults = race.finishedOrder.map((racer, index) => {
      return {
        playerId: racer.playerId || null,
        horseId: racer.horseId || racer.id,
        horseName: racer.name,
        time: racer.finishTime || race.time,
        position: index + 1,
        isAI: racer.isAI || false,
        finalEnergy: Math.round((racer.energy / racer.maxEnergy) * 100),
        stats: {
          speed: racer.performance?.speed || 50,
          handling: racer.performance?.handling || 50,
          stamina: Math.round((racer.energy / racer.maxEnergy) * 100)
        },
        skillsUsed: racer.skillLog || []
      };
    });
    
    console.log('[Multiplayer] 🏁 Final Results:', allResults.map(r => 
      `${r.position}. ${r.horseName}${r.isAI ? ' (AI)' : ''} - ${r.time.toFixed(2)}s (Energy: ${r.finalEnergy}%)`
    ));
    
    // Only player results for database
    const playerResults = allResults.filter(r => !r.isAI);

    return {
      results: playerResults,
      allResults: allResults,
      winnerId: playerResults[0]?.playerId || null,
      replayData: {
        seed: seed,
        frames: frames,
        racers: racers.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          style: r.style,
          stats: r.stats,
          skills: r.skills,
          isAI: r.isAI || false,
          playerId: r.playerId || null,
          horseId: r.horseId || r.id
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
    
    // Extract stats from wherever they are
    const stats = horseData.avatar?.stats || horseData.stats || {};
    const skills = horseData.avatar?.skills || horseData.skills || [];
    const style = horseData.avatar?.style || horseData.style || 'Pacer';
    
    console.log('[Multiplayer] Saving horse with stats:', JSON.stringify(stats));
    
    // Find most recent horse by this player with this name
    let { data: horses, error } = await supabase
      .from('horses')
      .select('*')
      .eq('player_id', playerId)
      .eq('name', horseData.name)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[Multiplayer] Error fetching horse:', error);
      throw error;
    }
    
    const horse = horses && horses.length > 0 ? horses[0] : null;

    const horseRecord = {
      player_id: playerId,
      wallet_address: walletAddress,
      name: horseData.name,
      image_url: horseData.image || horseData.portrait || horseData.avatar?.portrait || null,
      nft_token_id: horseData.tokenId || horseData.nft_token_id || null,
      stats: stats
    };

    // Create or update horse
    if (!horse) {
      const { data: newHorse, error: insertError } = await supabase
        .from('horses')
        .insert(horseRecord)
        .select()
        .single();

      if (insertError) throw insertError;
      horse = newHorse;
      console.log('[Multiplayer] ✅ Saved NEW horse to database:', horse.id, 'with stats:', JSON.stringify(horse.stats));
    } else {
      // Update existing horse with latest stats
      const { data: updatedHorse, error: updateError } = await supabase
        .from('horses')
        .update(horseRecord)
        .eq('id', horse.id)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('[Multiplayer] Error updating horse:', updateError);
        // Even if update fails, use the existing horse record
        console.log('[Multiplayer] Using existing horse record:', horse.id);
      } else if (updatedHorse) {
        horse = updatedHorse;
        console.log('[Multiplayer] ✅ Updated horse in database:', horse.id, 'with stats:', JSON.stringify(horse.stats));
      }
    }

    return horse;
  }

  function getSelectedHorse() {
    console.log('[Multiplayer] Getting selected horse...');
    console.log('[Multiplayer] walletState:', window.walletState);
    console.log('[Multiplayer] state.avatar:', window.state?.avatar);
    
    // Primary: Use state.avatar (has all current stats including training!)
    if (window.state && window.state.avatar && window.state.avatar.stats) {
      console.log('[Multiplayer] ✅ Using state.avatar (has current stats):', window.state.avatar.name);
      console.log('[Multiplayer] Avatar stats:', window.state.avatar.stats);
      return {
        id: window.state.avatar.id || window.walletState?.selectedId || 'avatar',
        name: window.state.avatar.name,
        stats: window.state.avatar.stats,
        skills: window.state.avatar.skills || [],
        style: window.state.avatar.style || 'Pacer',
        avatar: window.state.avatar,
        image: window.state.avatar.portrait,
        tokenId: window.state.avatar.tokenId
      };
    }
    
    // Fallback: try roster (might have outdated stats)
    if (window.walletState && window.walletState.selectedId) {
      const roster = window.walletState.roster || [];
      const selected = roster.find(h => h.id === window.walletState.selectedId);
      if (selected) {
        console.log('[Multiplayer] ⚠️ Using roster horse (might be outdated):', selected.name);
        return selected;
      }
    }

    // Last fallback: try to get from state.avatar
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
    console.log('[Multiplayer] Showing VISUAL race replay:', raceId);
    console.log('[Multiplayer] Race data:', raceData);
    
    // Get results and replay frames from different possible locations
    const results = raceData.allResults || raceData.results || raceData.replayData?.results || raceData.race_replay?.results || [];
    const replayFrames = raceData.race_replay?.frames || raceData.replayData?.frames || [];
    
    console.log('[Multiplayer] Results:', results.length, 'racers');
    console.log('[Multiplayer] Replay frames:', replayFrames.length);
    console.log('[Multiplayer] Race replay data structure:', raceData.race_replay ? 'race_replay exists' : 'NO race_replay!');
    console.log('[Multiplayer] ReplayData structure:', raceData.replayData ? 'replayData exists' : 'NO replayData!');
    
    // Switch to race screen to show visual replay
    const RaceUI = window.RaceSimulation;
    if (!RaceUI) {
      console.error('[Multiplayer] Race engine not available for visual replay');
      showResultsOnly(results);
      return;
    }
    
    // Navigate to race screen
    const raceScreen = document.getElementById('race-screen');
    if (raceScreen) {
      // Hide all screens
      ['menu-screen', 'training-screen', 'paddock-screen', 'retired-screen'].forEach(id => {
        const screen = document.getElementById(id);
        if (screen) screen.style.display = 'none';
      });
      raceScreen.style.display = 'flex';
    }
    
    // If we have replay frames, play visual animation
    if (replayFrames.length > 0) {
      await playVisualReplay(replayFrames, results);
    } else {
      // No frames, just show results
      showResultsOnly(results);
    }
  }
  
  function showResultsOnly(results) {
    console.log('[Multiplayer] Showing results modal (no visual replay)');
    
    // Create a modal overlay for results
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
    
    console.log('[Multiplayer] Displaying', results.length, 'race results');
    
    const modalHTML = `
      <div style="max-width: 800px; width: 100%; background: linear-gradient(135deg, rgba(20, 20, 40, 0.95), rgba(40, 40, 80, 0.95)); border-radius: 24px; padding: 40px; border: 3px solid var(--accent); pointer-events: all;">
        <h2 style="margin: 0 0 30px 0; text-align: center; color: var(--accent); font-size: 2em;">
          🏁 Multiplayer Race Results
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
                    Time: ${r.time ? r.time.toFixed(2) + 's' : 'N/A'} | Stamina: ${r.finalEnergy || r.stats?.stamina || '?'}%
                  </div>
                </div>
              </div>
              ${r.playerId === multiplayerState.currentPlayer?.id ? '<div style="background: var(--accent); padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 0.9em;">YOU</div>' : ''}
            </div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 16px; justify-content: center;">
          <button id="replay-close-btn" class="primary" style="padding: 16px 32px; font-size: 1.1em; cursor: pointer; pointer-events: all;">
            Back to Menu
          </button>
        </div>
      </div>
    `;
    
    replayModal.innerHTML = modalHTML;
    replayModal.style.pointerEvents = 'all';

    // Add close handler with immediate response
    const closeBtn = document.getElementById('replay-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        console.log('[Multiplayer] Closing results modal...');
        replayModal.remove();
        
        // Force show menu using the game's showScreen function
        if (typeof window.showScreen === 'function') {
          window.showScreen('menu');
        } else {
          // Manual fallback
          ['menu-screen', 'training-screen', 'race-screen', 'paddock-screen', 'retired-screen'].forEach(id => {
            const screen = document.getElementById(id);
            if (screen) {
              screen.style.display = id === 'menu-screen' ? 'flex' : 'none';
            }
          });
        }
      };
    }
  }
  
  async function playVisualReplay(frames, results) {
    console.log('[Multiplayer] Playing FULL visual replay with', frames.length, 'frames...');
    
    if (frames.length === 0) {
      console.log('[Multiplayer] No frames to replay, showing results immediately');
      showResultsOnly(results);
      return;
    }
    
    // Get drawRace function from single-player
    const drawRace = window.drawRace;
    if (!drawRace) {
      console.error('[Multiplayer] drawRace not available!');
      showResultsOnly(results);
      return;
    }
    
    // Hide start race button, show replay message
    const startBtn = document.getElementById('start-race');
    if (startBtn) startBtn.disabled = true;
    
    // Show countdown first (3, 2, 1, GO!)
    await showCountdown();
    
    // Animate through frames using REAL drawRace function!
    let currentFrame = 0;
    let commentaryTimer = 0;
    let lastCommentary = '';
    const PLAYBACK_SPEED = 1; // 1x speed (real-time)
    const TRACK_STEP = 1 / 20; // 0.05s
    
    return new Promise(resolve => {
      function animate() {
        if (currentFrame >= frames.length) {
          // Animation complete
          console.log('[Multiplayer] Replay animation complete!');
          if (startBtn) startBtn.disabled = false;
          // Hide commentary
          const commentaryBox = document.getElementById('race-commentary');
          if (commentaryBox) commentaryBox.style.display = 'none';
          showResultsOnly(results);
          resolve();
          return;
        }
        
        const frame = frames[currentFrame];
        
        // Reconstruct race object from frame data
        const race = {
          time: frame.time,
          racers: frame.racers,
          leaderboard: frame.leaderboard || frame.racers,
          running: true,
          trackLength: 1200,
          lastLeaderId: race?.lastLeaderId // Preserve for lead change detection
        };
        
        // Use ACTUAL drawRace function from single-player!
        drawRace(race);
        
        // Update HUD for first player
        const player = frame.racers.find(r => r.isRealPlayer);
        if (player) {
          updateMultiplayerHUD(player, race);
        }
        
        // Generate commentary every 3 seconds
        commentaryTimer += TRACK_STEP * PLAYBACK_SPEED;
        if (commentaryTimer >= 3) {
          commentaryTimer = 0;
          const commentary = generateMultiplayerCommentary(race);
          if (commentary && commentary !== lastCommentary) {
            showMultiplayerCommentary(commentary);
            lastCommentary = commentary;
          }
        }
        
        currentFrame += PLAYBACK_SPEED;
        requestAnimationFrame(animate);
      }
      
      animate();
    });
  }
  
  function generateMultiplayerCommentary(race) {
    const racers = race.racers.filter(r => !r.finished);
    if (racers.length === 0) return null;
    
    const leader = race.leaderboard[0];
    const second = race.leaderboard[1];
    
    if (!leader || !second) return null;
    
    const gap = leader.distance - second.distance;
    const progress = leader.distance / (race.trackLength || 1200);
    
    const messages = [];
    
    // Sprint commentary
    const sprinting = racers.filter(r => r.sprintMode);
    if (sprinting.length > 0) {
      messages.push(`${sprinting[0].name} is going all out!`);
      messages.push(`${sprinting[0].name} makes their move!`);
    }
    
    // Low stamina
    const lowStamina = racers.filter(r => (r.energy / r.maxEnergy) < 0.25);
    if (lowStamina.length > 0) {
      messages.push(`${lowStamina[0].name} is running on fumes!`);
      messages.push(`${lowStamina[0].name} is losing stamina fast!`);
    }
    
    // Close race
    if (gap < 15 && progress > 0.5) {
      messages.push(`It's neck and neck! This is a close race!`);
      messages.push(`${leader.name} and ${second.name} are inseparable!`);
    }
    
    // Leader dominating
    if (gap > 40) {
      messages.push(`${leader.name} has pulled away!`);
      messages.push(`${leader.name} is in complete control!`);
    }
    
    // Home straight
    if (progress > 0.8 && progress < 0.95) {
      messages.push(`Into the home straight - who will win?!`);
      messages.push(`The finish line is in sight!`);
    }
    
    // Final lap tension
    if (progress > 0.95) {
      messages.push(`This is it! The final meters!`);
    }
    
    // Lead changes
    if (race.lastLeaderId && race.lastLeaderId !== leader.id) {
      messages.push(`${leader.name} takes the lead!`);
      race.lastLeaderId = leader.id;
    }
    
    if (!race.lastLeaderId) race.lastLeaderId = leader.id;
    
    return messages.length > 0 ? messages[Math.floor(Math.random() * messages.length)] : null;
  }
  
  function showMultiplayerCommentary(text) {
    const commentaryEl = document.getElementById('commentary-text');
    const commentaryBox = document.getElementById('race-commentary');
    
    if (!commentaryEl || !commentaryBox) return;
    
    commentaryBox.style.display = 'block';
    commentaryEl.textContent = text;
    
    // Trigger animation
    commentaryBox.style.animation = 'none';
    setTimeout(() => {
      commentaryBox.style.animation = 'commentaryPulse 0.3s ease-out';
    }, 10);
  }
  
  function updateMultiplayerHUD(player, race) {
    const hudPhase = document.getElementById('hud-phase');
    const hudTimer = document.getElementById('hud-timer');
    const hudRank = document.getElementById('hud-rank');
    const hudEnergy = document.getElementById('hud-energy');
    
    if (hudPhase) hudPhase.textContent = `${player.phase || 'START'} · ${player.style || 'Pacer'}`;
    if (hudTimer) hudTimer.textContent = race.time.toFixed(1);
    
    const rank = (race.leaderboard || race.racers).findIndex(r => r.id === player.id) + 1;
    if (hudRank) hudRank.textContent = rank ? `#${rank}` : '--';
    
    const energyPct = Math.max(0, Math.min(100, Math.round((player.energy / player.maxEnergy) * 100)));
    if (hudEnergy) hudEnergy.style.width = `${energyPct}%`;
  }
  
  async function showCountdown() {
    return new Promise(resolve => {
      const canvas = document.getElementById('race-canvas');
      if (!canvas) {
        resolve();
        return;
      }
      
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      let count = 3;
      
      function drawCount() {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = count === 0 ? '#4ade80' : '#fbbf24';
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count === 0 ? 'GO!' : count.toString(), width / 2, height / 2);
        
        count--;
        
        if (count < 0) {
          resolve();
        } else {
          setTimeout(drawCount, 800);
        }
      }
      
      drawCount();
    });
  }

  // =====================================================
  // UTILITIES
  // =====================================================

  function generateMultiplayerTrackConditions() {
    const trackStates = ['clean', 'slightly_dirty', 'muddy'];
    const weatherConditions = ['sunny', 'overcast', 'rainy'];
    
    const trackState = trackStates[Math.floor(Math.random() * trackStates.length)];
    const weather = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
    
    let speedModifier = 1.0;
    let staminaModifier = 1.0;
    
    // Track state effects
    if (trackState === 'slightly_dirty') {
      speedModifier *= 0.96;
      staminaModifier *= 1.08;
    } else if (trackState === 'muddy') {
      speedModifier *= 0.88;
      staminaModifier *= 1.20;
    }
    
    // Weather effects
    if (weather === 'rainy') {
      speedModifier *= 0.94;
      staminaModifier *= 1.10;
    }
    
    return {
      trackState,
      weather,
      speedModifier,
      staminaModifier
    };
  }

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
