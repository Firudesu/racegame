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
    if (queueStatus) {
      queueStatus.style.display = 'block';
    }
  }

  function hideQueueStatus() {
    const queueStatus = document.getElementById('queue-status');
    if (queueStatus) {
      queueStatus.style.display = 'none';
    }
  }

  // =====================================================
  // MATCHMAKING
  // =====================================================

  function startMatchChecking() {
    // Check for matches every 3 seconds
    multiplayerState.matchCheckInterval = setInterval(checkForMatch, 3000);
    
    // Also check immediately
    checkForMatch();
  }

  async function checkForMatch() {
    if (!multiplayerState.inQueue) return;

    try {
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
        const myEntry = queueEntries.find(e => e.id === multiplayerState.queueEntryId);
        const myIndex = queueEntries.findIndex(e => e.id === multiplayerState.queueEntryId);

        if (myIndex < 2) {
          console.log('[Multiplayer] 🎉 Match found! Creating race...');
          await createMultiplayerRace(queueEntries.slice(0, 2));
        }
      }

    } catch (error) {
      console.error('[Multiplayer] Error checking for match:', error);
    }
  }

  async function createMultiplayerRace(queueEntries) {
    try {
      // Stop checking for more matches
      if (multiplayerState.matchCheckInterval) {
        clearInterval(multiplayerState.matchCheckInterval);
        multiplayerState.matchCheckInterval = null;
      }

      console.log('[Multiplayer] Creating race with', queueEntries.length, 'players');

      // TODO: For now, we'll simulate the race client-side
      // In production, this should be done server-side

      // Mark queue entries as matched
      for (const entry of queueEntries) {
        await supabase
          .from('race_queue')
          .update({ status: 'matched' })
          .eq('id', entry.id);
      }

      // Clean up our queue state
      multiplayerState.inQueue = false;
      multiplayerState.queueEntryId = null;
      hideQueueStatus();

      // Start the race with both players' horses
      startMultiplayerRaceSimulation(queueEntries);

    } catch (error) {
      console.error('[Multiplayer] Error creating race:', error);
      alert('Failed to create multiplayer race. Please try again.');
    }
  }

  async function startMultiplayerRaceSimulation(queueEntries) {
    console.log('[Multiplayer] Starting race simulation...');
    
    // Show notification
    showNotification('🏁 Race starting! Simulating...');

    try {
      // Create race record
      const { data: race, error: raceError } = await supabase
        .from('races')
        .insert({
          race_type: 'multiplayer',
          race_distance: 1600, // Default distance
          status: 'in_progress'
        })
        .select()
        .single();

      if (raceError) throw raceError;

      console.log('[Multiplayer] Created race record:', race.id);

      // Simulate race (client-side for now)
      const raceResults = simulateRace(queueEntries);

      // Save race replay data
      const { error: updateError } = await supabase
        .from('races')
        .update({
          replay_data: raceResults.replayData,
          winner_id: raceResults.winnerId,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', race.id);

      if (updateError) throw updateError;

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
    // Simple simulation - create random race times
    const results = queueEntries.map((entry, index) => {
      const baseTime = 90 + Math.random() * 15; // 90-105 seconds
      return {
        playerId: entry.player_id,
        horseId: entry.horse_id,
        horseName: entry.horse_data.name,
        time: baseTime,
        position: 0
      };
    });

    // Sort by time to determine positions
    results.sort((a, b) => a.time - b.time);
    results.forEach((r, i) => r.position = i + 1);

    // Create replay data (frame-by-frame positions)
    const replayData = {
      duration: 10, // 10 seconds replay
      frames: []
    };

    // Generate 100 frames of position data
    for (let frame = 0; frame <= 100; frame++) {
      const frameData = results.map((r, idx) => {
        // Add some variation to make it interesting
        const progress = (frame / 100) + (Math.random() * 0.02 - 0.01);
        return {
          horseId: r.horseId,
          horseName: r.horseName,
          position: Math.max(0, Math.min(1, progress + (idx * -0.02))) // Winner slightly ahead
        };
      });
      replayData.frames.push(frameData);
    }

    return {
      results,
      winnerId: results[0].horseId,
      replayData
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
      .single();

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
    // Try to get selected horse from the existing game state
    if (window.walletState && window.walletState.selectedId) {
      const roster = window.walletState.roster || [];
      const selected = roster.find(h => h.id === window.walletState.selectedId);
      if (selected) return selected;
    }

    // Fallback: try to get from state.avatar
    if (window.state && window.state.avatar) {
      return {
        name: window.state.avatar.name || 'My Horse',
        stats: window.state.avatar.stats || {},
        image: window.state.avatar.portrait || 'assets/default_horse.svg'
      };
    }

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

    const results = raceData.replayData?.results || raceData.results || [];
    
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
                    ${r.horseName || `Horse ${i + 1}`}
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
