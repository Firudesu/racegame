// Project Stride main logic

(() => {
  const Data = window.ProjectStrideData;
  const Storage = window.ProjectStrideStorage;

    const {
      TRACK_LENGTH,
      clamp,
      deepClone,
      createSeededRng,
      pickRandomSkill,
      createBaseAvatar,
      createAIRacer,
      RACING_STYLES,
      buildRacingProfile,
      deriveAptitudes,
      deriveSecondaryStats
    } = Data;

    const DAYJOB_PUNKS_CONTRACT = "0xa8d334c9cf7fc57eba51bf4d98bd880cb16a0de8";
    const WALLET_STORAGE_KEY = "projectStrideWallet";
    const ROSTER_STORAGE_PREFIX = "playerData";
    const ACTIVE_STORAGE_PREFIX = "projectStrideActive";
    const RESERVOIR_API_KEY = "";
    const OPENSEA_API_KEY = "fb2b196277d540ae95283e91d5f4d276";
    const PLACEHOLDER_IMAGE = "assets/default_horse.svg";

    const elements = {
      tokenId: document.getElementById("token-id"),
      avatarName: document.getElementById("avatar-name"),
      sessions: document.getElementById("avatar-sessions"),
      avatarStyle: document.getElementById("avatar-style"),
      legacyFlag: document.getElementById("legacy-flag"),
      skillList: document.getElementById("skill-list"),
      legacyList: document.getElementById("legacy-list"),
      legacyEmpty: document.getElementById("legacy-empty"),
      trainingLog: document.getElementById("training-log"),
      hudPhase: document.getElementById("hud-phase"),
      hudTimer: document.getElementById("hud-timer"),
      hudRank: document.getElementById("hud-rank"),
      hudEnergy: document.getElementById("hud-energy"),
      hudSkills: document.getElementById("hud-skills"),
      menuScreen: document.getElementById("menu-screen"),
      trainingScreen: document.getElementById("training-screen"),
      raceScreen: document.getElementById("race-screen"),
      paddockScreen: document.getElementById("paddock-screen"),
      retiredScreen: document.getElementById("retired-screen"),
      paddockGrid: document.getElementById("paddock-grid"),
      paddockMessage: document.getElementById("paddockMessage"),
      paddockContextMenu: document.getElementById("paddock-context-menu"),
      retiredList: document.getElementById("retiredList"),
      avatarPortrait: document.getElementById("avatar-portrait"),
      sessionsLeft: document.getElementById("sessions-left"),
      trainingTimer: document.getElementById("training-timer"),
      walletStatus: document.getElementById("wallet-status"),
      walletConnect: document.getElementById("wallet-connect"),
      createHorseBtn: document.getElementById("createHorseBtn"),
      importHorseBtn: document.getElementById("importHorseBtn"),
      mapPins: document.querySelectorAll(".map-pin"),
      returnButtons: document.querySelectorAll("[data-return]"),
      backToMenu: document.getElementById("back-to-menu"),
      raceBack: document.getElementById("race-back"),
      startRace: document.getElementById("start-race"),
      resultsModal: document.getElementById("results-modal"),
      resultsBody: document.getElementById("results-body"),
      resultsBack: document.getElementById("results-back"),
      resultsReplay: document.getElementById("results-replay"),
      menuButtons: document.querySelectorAll(".menu-buttons button"),
      trainingButtons: document.querySelectorAll(".training-buttons button"),
      raceCanvas: document.getElementById("race-canvas"),
      menuRoot: document.getElementById("menu-screen"),
      retireButton: document.querySelector('button[data-action="retire"]'),
      trainButton: document.querySelector('button[data-action="train"]'),
      raceButton: document.querySelector('button[data-action="race"]'),
      resetButton: document.querySelector('button[data-action="reset"]')
    };

  const statBars = {
    stride: {
      bar: document.getElementById("stat-stride"),
      value: document.getElementById("stat-stride-value")
    },
    endurance: {
      bar: document.getElementById("stat-endurance"),
      value: document.getElementById("stat-endurance-value")
    },
    force: {
      bar: document.getElementById("stat-force"),
      value: document.getElementById("stat-force-value")
    },
    resolve: {
      bar: document.getElementById("stat-resolve"),
      value: document.getElementById("stat-resolve-value")
    },
    insight: {
      bar: document.getElementById("stat-insight"),
      value: document.getElementById("stat-insight-value")
    },
    mood: {
      bar: document.getElementById("stat-mood"),
      value: document.getElementById("stat-mood-value")
    }
  };

  console.log('[INIT] Screen elements:', {
    menuScreen: !!elements.menuScreen,
    trainingScreen: !!elements.trainingScreen,
    raceScreen: !!elements.raceScreen,
    paddockScreen: !!elements.paddockScreen,
    retiredScreen: !!elements.retiredScreen
  });

  const canvas = elements.raceCanvas;
  const ctx = canvas.getContext("2d");
  let deviceRatio = window.devicePixelRatio || 1;
  let eventsBound = false;
  resizeCanvas();

    const state = {
      avatar: null,
      tokenId: null,
      legacyRecords: [],
      trainingLog: [],
      lastTrainedStat: null,
      currentScreen: "menu",
      race: null,
      lastRaceConfig: null
    };

    const walletState = {
      address: null,
      roster: [],
      selectedId: null,
      availableNFTs: [],
      lastFetch: 0
    };
    
    // Expose to window for multiplayer.js
    window.walletState = walletState;
    window.state = state;

    const trainingSession = {
      active: false,
      countdown: 0,
      timerId: null,
      intervalId: null,
      pendingStat: null
    };

    let contextMenuEntryId = null;

  const Sfx = createSfx();

  function playSfx(name) {
    if (!Sfx) return;
    Sfx.play(name);
  }

  const TRAINING_BASE_GAIN = 8;
  const TRACK_STEP = 1 / 20;

  const TRACK_ZONES = [
    { key: "inside", display: "Inside Track", radiusOffset: -24, distanceMultiplier: 0.99 }, // Reduced from 0.98
    { key: "mid", display: "Mid Track", radiusOffset: 0, distanceMultiplier: 1 },
    { key: "outside", display: "Outside Track", radiusOffset: 24, distanceMultiplier: 1.01 } // Reduced from 1.03
  ];
  
  // Track sections for tactical racing (straights vs turns)
  const TRACK_SECTIONS = [
    { name: "Straight 1", start: 0.00, end: 0.20, type: "straight", speedBonus: 1.05, overtakeBonus: 1.3 },
    { name: "Turn 1", start: 0.20, end: 0.35, type: "turn", speedBonus: 0.96, handlingMatter: true },
    { name: "Straight 2 (Back)", start: 0.35, end: 0.65, type: "straight", speedBonus: 1.06, overtakeBonus: 1.4 },
    { name: "Turn 2", start: 0.65, end: 0.80, type: "turn", speedBonus: 0.96, handlingMatter: true },
    { name: "Home Straight", start: 0.80, end: 1.00, type: "straight", speedBonus: 1.08, overtakeBonus: 1.5 }
  ];

  const ZONE_COUNT = TRACK_ZONES.length;
  const LANE_COUNT = ZONE_COUNT;
  const DEFAULT_ZONE_INDEX = Math.floor(ZONE_COUNT / 2);
  const ZONE_CHANGE_RATE = 2.6;
  const PASS_DISTANCE_THRESHOLD = 24;
  const PASS_COOLDOWN_MIN = 4.0; // Increased from 2.0 - horses wait longer between attempts
  const PASS_COOLDOWN_MAX = 6.0; // Increased from 4.0 - more realistic timing
  const PASS_COST_SUCCESS = { min: 10, max: 16 }; // Increased from 6-10 - passing is expensive!
  const PASS_COST_FAIL = { min: 18, max: 25 }; // Increased from 4-8 - failed pass is VERY costly
  const BLOCK_STAMINA_TICK = 2;
  const BLOCK_DEFENSE_COST = 2.5;
  const FINAL_SPRINT_COST = 15;
  const BLOCKED_DRAIN_INTERVAL = 0.6;
  const COAST_REGEN_BASE = 0.12;
  const START_PHASE_LIMIT = 0.25;
  const FINAL_PHASE_START = 0.8;
  const STYLE_PHASE_MAP = Object.fromEntries(
    Object.entries(RACING_STYLES).map(([key, def]) => [key, def.phaseBonus])
  );
  const STYLE_MANEUVER_ADJUST = Object.fromEntries(
    Object.entries(RACING_STYLES).map(([key, def]) => [key, def.maneuverModifier || 0])
  );

  // Wait for DOM to be fully loaded before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // FORCE hide all non-menu screens immediately
    const trainingScreen = document.getElementById("training-screen");
    const raceScreen = document.getElementById("race-screen");
    const paddockScreen = document.getElementById("paddock-screen");
    const retiredScreen = document.getElementById("retired-screen");
    
    if (trainingScreen) trainingScreen.style.display = 'none';
    if (raceScreen) raceScreen.style.display = 'none';
    if (paddockScreen) paddockScreen.style.display = 'none';
    if (retiredScreen) retiredScreen.style.display = 'none';
    
    console.log('[INIT] Forced screens to display: none');

    state.legacyRecords = Storage.loadLegacyRecords();
    state.avatar = Storage.loadCurrentAvatar();
    state.tokenId = Storage.loadTokenId();

    if (!state.avatar) {
      const legacyData = state.legacyRecords[0] || null;
      state.avatar = createBaseAvatar({
        legacyBonus: Boolean(legacyData),
        legacyData
      });
      Storage.saveCurrentAvatar(state.avatar);
    }

    ensureAvatarSchema();

    if (!state.tokenId) {
      state.tokenId = generateTokenId();
      Storage.saveTokenId(state.tokenId);
    }

      initializeWalletState();
      bindEvents();
    refreshUI();
      renderPaddockRoster();
      renderRetiredStable();
    showScreen("menu");
    drawRaceIdle();
  }

    function bindEvents() {
      if (eventsBound) return;
      eventsBound = true;

      elements.menuButtons.forEach((button) => {
        button.addEventListener("click", onMenuAction);
      });

      elements.trainingButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const stat = button.dataset.train;
          if (stat) {
            beginTrainingSession(stat);
          }
        });
      });

      if (elements.mapPins) {
        elements.mapPins.forEach((pin) => {
          pin.addEventListener("click", () => {
            const target = pin.dataset.target;
            if (target) {
              navigateScreen(target);
            }
          });
        });
      }

      if (elements.returnButtons) {
        elements.returnButtons.forEach((button) => {
          if (button.id === "race-back") return;
          button.addEventListener("click", () => {
            navigateScreen("menu");
          });
        });
      }

      if (elements.backToMenu) {
        elements.backToMenu.addEventListener("click", () => {
          navigateScreen("menu");
        });
      }

      if (elements.raceBack) {
        elements.raceBack.addEventListener("click", () => {
          stopRace();
          navigateScreen("menu");
        });
      }

      if (elements.startRace) {
        elements.startRace.addEventListener("click", () => {
          showStrategyModal();
        });
      }

      if (elements.resultsBack) {
        elements.resultsBack.addEventListener("click", () => {
          hideResults();
          navigateScreen("menu");
        });
      }

      if (elements.resultsReplay) {
        elements.resultsReplay.addEventListener("click", () => {
          hideResults();
          if (state.lastRaceConfig) {
            navigateScreen("race");
            startRace(true);
          }
        });
      }

      if (elements.walletConnect) {
        elements.walletConnect.addEventListener("click", connectWalletFlow);
      }

      if (elements.createHorseBtn) {
        elements.createHorseBtn.addEventListener("click", () => {
          createStableHorse();
        });
      }

      if (elements.importHorseBtn) {
        elements.importHorseBtn.addEventListener("click", () => {
          openNFTImport();
        });
      }

      if (elements.paddockContextMenu) {
        elements.paddockContextMenu.addEventListener("click", onPaddockContextAction);
      }

      document.addEventListener("click", hidePaddockContextMenu);
      window.addEventListener("scroll", hidePaddockContextMenu, true);
      document.addEventListener("contextmenu", (event) => {
        if (!event.target.closest(".paddock-grid .slot")) {
          hidePaddockContextMenu();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          hidePaddockContextMenu();
        }
      });

      window.addEventListener("resize", () => {
        resizeCanvas();
        if (state.currentScreen === "race") {
          if (state.race) {
            drawRace(state.race);
          } else {
            drawRaceIdle();
          }
        } else {
          drawRaceIdle();
        }
      });

      if (elements.legacyList) {
        elements.legacyList.addEventListener("click", onLegacyAction);
      }

      // Reset All Data button
      const resetAllDataBtn = document.getElementById("reset-all-data");
      if (resetAllDataBtn) {
        resetAllDataBtn.addEventListener("click", () => {
          handleReset();
        });
      }
    }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    if (ratio === deviceRatio) {
      return;
    }
    deviceRatio = ratio;
    const width = canvas.width;
    const height = canvas.height;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawRaceIdle();
  }

  function refreshUI() {
    updateAvatarProfile();
    elements.tokenId.textContent = state.tokenId;
    elements.avatarName.textContent = state.avatar.name;
    elements.sessions.textContent = state.avatar.sessions;
      updateTrainingStatusUI();
    if (elements.avatarStyle) {
      elements.avatarStyle.textContent = state.avatar.style;
    }
    elements.legacyFlag.textContent = state.avatar.legacy ? "Legacy boosted" : "";
      if (elements.avatarPortrait) {
        const portrait = state.avatar.portrait || state.avatar.image || PLACEHOLDER_IMAGE;
        elements.avatarPortrait.src = portrait || PLACEHOLDER_IMAGE;
      }

    Object.entries(state.avatar.stats).forEach(([stat, value]) => {
      const bar = statBars[stat];
      if (!bar) return;
      bar.bar.style.width = `${clamp(value, 0, 100)}%`;
      bar.value.textContent = value;
    });

    updateMoodUI();

      renderSkills();
      renderSecondaryStats();
      renderLegacyGallery();
      renderRetiredStable();
      updateMenuState();
      renderTrainingLog();
  }

  function ensureAvatarSchema() {
    if (!state.avatar) return;

    if (typeof state.avatar.mood !== "number") {
      state.avatar.mood = 75;
    }

    if (!state.avatar.style || !RACING_STYLES[state.avatar.style]) {
      state.avatar.style = "Pacer";
    }

    const coreStats = ["stride", "endurance", "force", "resolve", "insight"];
    state.avatar.stats = state.avatar.stats || {};
    coreStats.forEach((key) => {
      if (typeof state.avatar.stats[key] !== "number") {
        state.avatar.stats[key] = 50;
      }
    });

    state.avatar.modifiers = state.avatar.modifiers || {};
    const mods = state.avatar.modifiers;
    if (typeof mods.trainingBonus !== "number") {
      mods.trainingBonus = state.avatar.legacy ? 0.12 : 0.05;
    }
    if (typeof mods.skillChanceBonus !== "number") {
      mods.skillChanceBonus = state.avatar.legacy ? 0.12 : 0.05;
    }
    if (typeof mods.legendaryLuck !== "number") {
      mods.legendaryLuck = state.avatar.legacy ? 0.25 : 0.08;
    }
    if (typeof mods.secondaryBonus !== "number") {
      mods.secondaryBonus = state.avatar.legacy ? 0.2 : 0.08;
    }

      if (!state.avatar.version || state.avatar.version < 3) {
        state.avatar.version = 3;
      }

      updateAvatarProfile({ persist: false });
      if (!state.avatar.profile?.secondary) {
        updateAvatarProfile({ persist: true });
      } else {
        state.avatar.secondary = deepClone(state.avatar.profile.secondary);
        Storage.saveCurrentAvatar(state.avatar);
      }
  }

  function updateMoodUI() {
    const moodBar = statBars.mood;
    if (!moodBar) return;
    const mood = clamp(Math.round(state.avatar.mood ?? 0), 0, 100);
    moodBar.bar.style.width = `${mood}%`;
    moodBar.value.textContent = `${mood}%`;
  }

  function renderSkills() {
    elements.skillList.innerHTML = "";
    const rarityLabels = {
      1: "Common",
      2: "Uncommon",
      3: "Rare",
      4: "Epic",
      5: "Legendary"
    };
    state.avatar.skills.forEach((skill) => {
      const li = document.createElement("li");
      const description = skill.description || skill.meta?.summary || formatSkillSummary(skill);
      const rarityText = rarityLabels[skill.rarity || 1] || "Common";
      li.innerHTML = `<strong>${skill.name}</strong><br/><small>${description} • ${rarityText}</small>`;
      elements.skillList.appendChild(li);
    });
  }

  function renderSecondaryStats() {
    const container = document.getElementById('secondary-stats-display');
    if (!container) return;
    
    const aptitudes = state.avatar.aptitudes || {};
    const secondary = state.avatar.secondary || {};
    const profile = state.avatar.profile || {};
    
    // Determine best distance
    const distanceType = aptitudes.distance?.type || profile.aptitudes?.distance?.type || 'mid';
    const distanceLabels = { sprint: 'Sprint (800m)', mid: 'Mid-Distance (1200m)', long: 'Long (1800m)' };
    const distanceLabel = distanceLabels[distanceType] || 'Mid-Distance (1200m)';
    
    // Determine surface preference
    const surfacePreferred = aptitudes.surface?.preferred || profile.aptitudes?.surface?.preferred || 'grass';
    const surfaceLabel = surfacePreferred === 'dirt' ? 'Dirt' : 'Grass';
    
    container.innerHTML = `
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🏁 Best Distance</span>
        <span class="secondary-stat-value">${distanceLabel}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🌱 Prefers</span>
        <span class="secondary-stat-value">${surfaceLabel} Tracks</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🌦️ Track Adaptability</span>
        <span class="secondary-stat-value">${secondary.trackAdaptability || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">⚡ Passing Power</span>
        <span class="secondary-stat-value">${secondary.passingPower || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🎯 Pace Control</span>
        <span class="secondary-stat-value">${secondary.paceControl || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">💪 Fatigue Resistance</span>
        <span class="secondary-stat-value">${secondary.fatigueResistance || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🚀 Sprint Power</span>
        <span class="secondary-stat-value">${secondary.sprintPower || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">⚡ Sprint Efficiency</span>
        <span class="secondary-stat-value">${secondary.sprintEfficiency || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🔄 Sprint Frequency</span>
        <span class="secondary-stat-value">${secondary.burstFrequency || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">💚 Stamina Recovery</span>
        <span class="secondary-stat-value">${secondary.staminaRecovery || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">☀️ Dry Track Performance</span>
        <span class="secondary-stat-value">${secondary.surfacePerformance?.dry || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">🌧️ Wet Track Performance</span>
        <span class="secondary-stat-value">${secondary.surfacePerformance?.wet || 60}</span>
      </div>
      <div class="secondary-stat-item">
        <span class="secondary-stat-label">💧 Muddy Track Performance</span>
        <span class="secondary-stat-value">${secondary.surfacePerformance?.muddy || 60}</span>
      </div>
    `;
  }

  function formatSkillSummary(skill) {
    if (!skill) return "Passive bonus";
    if (skill.description) return skill.description;
    if (skill.trigger && typeof skill.boost === "number") {
      return `${capitalize(skill.trigger)} burst +${Math.round(skill.boost * 100)}%`;
    }
    if (skill.type) return capitalize(skill.type);
    return "Passive bonus";
  }

  function renderLegacyGallery() {
    const list = elements.legacyList;
    const empty = elements.legacyEmpty;
    if (!list || !empty) return;

    list.innerHTML = "";
    if (!state.legacyRecords.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    state.legacyRecords.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "legacy-card";

      const skillPreview = entry.skills?.length
        ? `${entry.skills
            .slice(0, 3)
            .map((s) => s.name)
            .join(", ")}${entry.skills.length > 3 ? ` +${entry.skills.length - 3}` : ""}`
        : "None";
      const retiredAt = new Date(entry.retiredAt).toLocaleDateString();
      const distanceLabel = entry.aptitudes?.distance?.type || "Balanced";
      const surfaceLabel = entry.aptitudes?.surface?.preferred || "Balanced";
      const passingLabel = entry.aptitudes?.passing?.rating
        ? `${entry.aptitudes.passing.rating}`
        : "--";

      li.innerHTML = `
        <header>
          <span>${entry.name}</span>
          <span class="legacy-meta">${retiredAt}</span>
        </header>
        <div class="legacy-meta">Token ${entry.tokenId} • Mood ${entry.mood ?? 0}%</div>
        <div class="legacy-meta">Style: ${entry.style || entry.styleName || "Unknown"}</div>
        <div class="legacy-meta">Distance: ${distanceLabel} • Surface: ${surfaceLabel} • Passing: ${passingLabel}</div>
        <div class="legacy-meta">Skills: ${skillPreview}</div>
        <div class="legacy-actions">
          <button data-action="revive" data-id="${entry.id}" class="secondary">Revive</button>
        </div>
      `;

      list.appendChild(li);
    });
    }

    function renderRetiredStable() {
      const container = elements.retiredList;
      if (!container) return;

      container.innerHTML = "";
      if (!state.legacyRecords.length) {
        container.classList.add("empty");
        container.textContent = "No retired horses yet.";
        return;
      }

      container.classList.remove("empty");

      state.legacyRecords.forEach((record) => {
        const card = document.createElement("div");
        card.className = "retired-card";

        const image = normalizeImageUrl(record.image || record.portrait) || PLACEHOLDER_IMAGE;
        const retiredAt = record.retiredAt ? new Date(record.retiredAt).toLocaleDateString() : "";
        const statsSummary = record.stats
          ? `Stride ${record.stats.stride} • Endurance ${record.stats.endurance} • Force ${record.stats.force}`
          : "";

        card.innerHTML = `
          <header>
            <img src="${image}" alt="${record.name}" />
            <div>
              <strong>${record.name}</strong>
              <div class="meta">${retiredAt}</div>
            </div>
          </header>
          <div class="meta">Token: ${record.tokenId || "—"} • Style: ${record.style || "Pacer"}</div>
          <div class="meta">${statsSummary}</div>
          <button class="secondary" type="button" data-action="legacy-attach" data-id="${record.id || ""}">Attach to Horse</button>
        `;

        const button = card.querySelector('button[data-action="legacy-attach"]');
        if (button) {
          button.addEventListener("click", () => {
            window.alert("Legacy attachment will be available in a future update.");
          });
        }

        container.appendChild(card);
      });
    }

    function initializeWalletState() {
      const stored = loadStoredWallet();
      if (stored) {
        walletState.address = stored.toLowerCase();
        walletState.roster = loadRoster(walletState.address);
        let activeId = loadActiveHorseId(walletState.address);

        if (!walletState.roster.length) {
          const entry = createRosterEntryFromAvatar(state.avatar, {
            tokenId: state.tokenId,
            image: state.avatar.portrait || state.avatar.image,
            collection: "Stable"
          });
          walletState.roster.push(entry);
          walletState.selectedId = entry.id;
          saveRoster();
          saveActiveHorseId(walletState.address, entry.id);
          applyRosterSelectionById(entry.id, { skipPersist: true, skipRender: true });
        } else {
          if (!activeId || !walletState.roster.some((horse) => horse.id === activeId)) {
            activeId = walletState.roster[0].id;
          }
          walletState.selectedId = activeId;
          applyRosterSelectionById(activeId, { skipPersist: true, skipRender: true });
        }
      } else {
        walletState.address = null;
        walletState.roster = [];
        walletState.selectedId = null;
        walletState.availableNFTs = [];
        walletState.lastFetch = 0;
      }

      updateWalletUI();
      renderPaddockRoster();

      if (walletState.address) {
        fetchWalletNFTs(walletState.address).catch((error) => {
          console.warn("NFT lookup failed:", error);
        });
      }
    }

    function loadStoredWallet() {
      try {
        return localStorage.getItem(WALLET_STORAGE_KEY) || null;
      } catch (error) {
        console.warn("Unable to access wallet storage:", error);
        return null;
      }
    }

    function saveWalletAddress(address) {
      if (!address) return;
      try {
        localStorage.setItem(WALLET_STORAGE_KEY, address);
      } catch (error) {
        console.warn("Unable to persist wallet address:", error);
      }
    }

    function getRosterKey(address) {
      return `${ROSTER_STORAGE_PREFIX}_${address}`;
    }

    function getActiveKey(address) {
      return `${ACTIVE_STORAGE_PREFIX}_${address}`;
    }

    function loadRoster(address) {
      if (!address) return [];
      try {
        let raw = localStorage.getItem(getRosterKey(address));
        if (!raw) {
          const legacyKey = `projectStrideRoster_${address}`;
          raw = localStorage.getItem(legacyKey);
          if (raw) {
            const legacyParsed = JSON.parse(raw);
            const migrated = Array.isArray(legacyParsed)
              ? { wallet: address, horses: legacyParsed }
              : legacyParsed;
            localStorage.setItem(getRosterKey(address), JSON.stringify(migrated));
            localStorage.removeItem(legacyKey);
            raw = JSON.stringify(migrated);
          }
        }
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        if (parsed && Array.isArray(parsed.horses)) {
          return parsed.horses;
        }
        return [];
      } catch (error) {
        console.warn("Unable to load roster:", error);
        return [];
      }
    }

    function saveRoster() {
      if (!walletState.address) return;
      const payload = {
        wallet: walletState.address,
        horses: walletState.roster
      };
      try {
        localStorage.setItem(getRosterKey(walletState.address), JSON.stringify(payload));
        localStorage.removeItem(`projectStrideRoster_${walletState.address}`);
      } catch (error) {
        console.warn("Unable to save roster:", error);
      }
    }

    function loadActiveHorseId(address) {
      if (!address) return null;
      try {
        return localStorage.getItem(getActiveKey(address));
      } catch (error) {
        console.warn("Unable to load active horse id:", error);
        return null;
      }
    }

    function saveActiveHorseId(address, id) {
      if (!address) return;
      const key = getActiveKey(address);
      try {
        if (!id) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, id);
        }
      } catch (error) {
        console.warn("Unable to persist active horse id:", error);
      }
    }

    function updateWalletUI() {
      if (!elements.walletStatus) return;
      const panel = elements.walletStatus.closest(".wallet-panel");

      if (walletState.address) {
        elements.walletStatus.textContent = `Connected: ${shortenAddress(walletState.address)}`;
        if (panel) panel.classList.add("connected");
        if (elements.walletConnect) {
          elements.walletConnect.textContent = "Switch Wallet";
        }
      } else {
        elements.walletStatus.textContent = "Wallet not connected";
        if (panel) panel.classList.remove("connected");
        if (elements.walletConnect) {
          elements.walletConnect.textContent = "Connect Wallet";
        }
      }
    }

    async function connectWalletFlow() {
      if (typeof window.ethereum === "undefined") {
        updatePaddockMessage("MetaMask not detected. Install MetaMask to import NFTs.");
        window.open("https://metamask.io/download/", "_blank", "noopener");
        return;
      }

      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts && accounts[0] ? accounts[0].toLowerCase() : null;
        if (!address) return;

        await window.ethereum.request({
          method: "personal_sign",
          params: ["Sign in to Horse Trainer Demo", address]
        });

        await handleWalletConnected(address);
      } catch (error) {
        console.warn("Wallet connection failed:", error);
        updatePaddockMessage("Wallet connection was cancelled.");
      }
    }

    async function handleWalletConnected(address) {
      walletState.address = address;
      saveWalletAddress(address);
      walletState.availableNFTs = [];
      walletState.lastFetch = 0;

      walletState.roster = loadRoster(address);
      if (!walletState.roster.length) {
        const entry = createRosterEntryFromAvatar(state.avatar, {
          tokenId: state.tokenId || generateTokenId(),
          image: state.avatar.portrait || state.avatar.image,
          collection: "Stable"
        });
        walletState.roster.push(entry);
        walletState.selectedId = entry.id;
      } else {
        const saved = loadActiveHorseId(address);
        if (saved && walletState.roster.some((horse) => horse.id === saved)) {
          walletState.selectedId = saved;
        } else {
          walletState.selectedId = walletState.roster[0].id;
        }
      }

      saveRoster();
      saveActiveHorseId(address, walletState.selectedId);

      updateWalletUI();
      applyRosterSelectionById(walletState.selectedId);
      await fetchWalletNFTs(address, { force: true });
    }

    function renderPaddockRoster() {
      const grid = elements.paddockGrid;
      if (!grid) return;

      hidePaddockContextMenu();

      const slots = Array.from(grid.querySelectorAll(".slot"));
      slots.forEach((slot, index) => {
        const entry = walletState.roster[index];
        slot.classList.remove("filled", "selected");
        slot.innerHTML = "";
        slot.onclick = null;
        slot.oncontextmenu = null;

        if (!entry) {
          slot.innerHTML = `
            <strong>Empty Stall</strong>
            <div class="horse-meta">Use Create or Import to fill this stable.</div>
          `;
          return;
        }

        slot.classList.add("filled");
        if (entry.id === walletState.selectedId) {
          slot.classList.add("selected");
        }

        const img = document.createElement("img");
        img.src = entry.image || PLACEHOLDER_IMAGE;
        img.alt = entry.name;

        const name = document.createElement("div");
        name.className = "horse-name";
        name.textContent = entry.name;

        const meta = document.createElement("div");
        meta.className = "horse-meta";
        meta.textContent =
          entry.collection === "DayJobPunks"
            ? `Dayjob Punk #${entry.tokenId}`
            : "Stable Horse";

        const stats = document.createElement("div");
        stats.className = "horse-stats";
        const statOrder = ["stride", "endurance", "force", "resolve", "insight"];
        statOrder.forEach((statKey) => {
          const value = entry.avatar.stats?.[statKey];
          if (typeof value === "number") {
            const statEl = document.createElement("span");
            statEl.textContent = `${capitalize(statKey)} ${value}`;
            stats.appendChild(statEl);
          }
        });

        const sessions = document.createElement("div");
        sessions.className = "horse-meta";
        sessions.textContent = `${entry.avatar.sessions ?? 0} sessions remaining`;

        const actions = document.createElement("div");
        actions.className = "slot-actions";

        const selectBtn = document.createElement("button");
        if (entry.id === walletState.selectedId) {
          selectBtn.textContent = "Active";
          selectBtn.disabled = true;
        } else {
          selectBtn.textContent = "Set Active";
          selectBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            applyRosterSelectionById(entry.id);
          });
        }

        const releaseBtn = document.createElement("button");
        releaseBtn.className = "secondary";
        releaseBtn.textContent = "Release";
        releaseBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          releaseHorse(entry.id);
        });

        actions.appendChild(selectBtn);
        actions.appendChild(releaseBtn);

        slot.appendChild(img);
        slot.appendChild(name);
        slot.appendChild(meta);
        slot.appendChild(stats);
        slot.appendChild(sessions);
        slot.appendChild(actions);

        slot.onclick = () => {
          applyRosterSelectionById(entry.id);
        };
        slot.oncontextmenu = (event) => {
          openPaddockContextMenu(event, entry);
        };
      });

      if (elements.createHorseBtn) {
        elements.createHorseBtn.disabled = !walletState.address || walletState.roster.length >= 4;
      }
      if (elements.importHorseBtn) {
        elements.importHorseBtn.disabled = !walletState.address || walletState.roster.length >= 4;
      }

      updatePaddockMessage();
    }

    function updatePaddockMessage(message) {
      if (!elements.paddockMessage) return;
      if (message) {
        elements.paddockMessage.textContent = message;
        return;
      }

      if (!walletState.address) {
        elements.paddockMessage.textContent =
          "Connect MetaMask to import Dayjob Punks NFTs or create stable horses.";
        return;
      }

      const rosterCount = walletState.roster.length;
      if (rosterCount >= 4) {
        elements.paddockMessage.textContent =
          "All stalls are occupied. Release a horse to import an NFT or create a new trainee.";
        return;
      }
      const nftCount = walletState.availableNFTs.length;
      const pluralNFT = nftCount === 1 ? "" : "s";
      const nftText =
        nftCount > 0
          ? `${nftCount} NFT${pluralNFT} ready to import.`
          : "No Dayjob Punks detected yet.";
      elements.paddockMessage.textContent = `${rosterCount}/4 horses in the paddock. ${nftText}`;
    }

    function openPaddockContextMenu(event, entry) {
      if (!elements.paddockContextMenu) return;
      event.preventDefault();
      hidePaddockContextMenu();
      contextMenuEntryId = entry.id;
      const menu = elements.paddockContextMenu;
      menu.innerHTML = `
        <button data-action="view">View Stats</button>
        <button data-action="set">Set as Main Horse</button>
        <button data-action="release">Release Horse</button>
      `;
      menu.dataset.entryId = entry.id;
      menu.style.visibility = "hidden";
      menu.hidden = false;

      const { pageX, pageY } = event;
      // Force layout to measure size
      const width = menu.offsetWidth || 180;
      const height = menu.offsetHeight || 160;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      let left = pageX;
      let top = pageY;
      if (left + width > viewportWidth) {
        left = Math.max(8, viewportWidth - width - 8);
      }
      if (top + height > viewportHeight) {
        top = Math.max(8, viewportHeight - height - 8);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = "visible";
    }

    function hidePaddockContextMenu() {
      const menu = elements.paddockContextMenu;
      if (!menu) return;
      if (!menu.hidden) {
        menu.hidden = true;
        menu.innerHTML = "";
      }
      contextMenuEntryId = null;
    }

    function onPaddockContextAction(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      event.preventDefault();
      const action = button.dataset.action;
      const entryId = contextMenuEntryId;
      hidePaddockContextMenu();
      if (!entryId) return;
      const entry = walletState.roster.find((horse) => horse.id === entryId);
      if (!entry) return;
      switch (action) {
        case "view":
          showHorseStats(entry);
          break;
        case "set":
          applyRosterSelectionById(entry.id);
          break;
        case "release":
          releaseHorse(entry.id);
          break;
        default:
          break;
      }
    }

    function showHorseStats(entry) {
      const stats = entry.avatar?.stats || {};
      const mood = typeof entry.avatar?.mood === "number" ? `${entry.avatar.mood}%` : "—";
      const lines = [
        `${entry.name}`,
        `Collection: ${entry.collection || "Stable"}`,
        `Sessions left: ${entry.avatar.sessions ?? 0}`,
        `Mood: ${mood}`,
        `Stride: ${stats.stride ?? "--"}`,
        `Endurance: ${stats.endurance ?? "--"}`,
        `Force: ${stats.force ?? "--"}`,
        `Resolve: ${stats.resolve ?? "--"}`,
        `Insight: ${stats.insight ?? "--"}`
      ];
      window.alert(lines.join("\n"));
    }

    function createRosterEntryFromAvatar(avatar, overrides = {}) {
      const snapshot = deepClone(avatar);
      finalizeAvatarSnapshot(snapshot);
      const entryId = `horse_${Math.random().toString(36).slice(2, 10)}`;
      const image = overrides.image || snapshot.portrait || snapshot.image || PLACEHOLDER_IMAGE;
      const tokenId = overrides.tokenId || snapshot.tokenId || generateTokenId();
      return {
        id: entryId,
        name: snapshot.name,
        avatar: snapshot,
        image,
        tokenId,
        collection: overrides.collection || (overrides.tokenId ? "DayJobPunks" : "Stable"),
        createdAt: overrides.createdAt || Date.now()
      };
    }

    function finalizeAvatarSnapshot(avatar) {
      if (!avatar || !avatar.stats) return avatar;
      const modifiers = avatar.modifiers || {};
      avatar.sessions = typeof avatar.sessions === "number" ? avatar.sessions : 10;
      avatar.portrait = avatar.portrait || avatar.image || PLACEHOLDER_IMAGE;
      const profile = buildRacingProfile(avatar.stats, modifiers);
      const secondary = deriveSecondaryStats(avatar.stats, modifiers, profile.aptitudes);
      avatar.profile = {
        performance: deepClone(profile.performance),
        aptitudes: deepClone(profile.aptitudes),
        secondary: deepClone(secondary)
      };
      avatar.performance = deepClone(profile.performance);
      avatar.aptitudes = deepClone(profile.aptitudes);
      avatar.secondary = deepClone(secondary);
      avatar.maneuverRating = avatar.performance.maneuver;
      return avatar;
    }

    function applyRosterSelectionById(id, { skipPersist = false, skipRender = false } = {}) {
      const entry = walletState.roster.find((horse) => horse.id === id);
      if (!entry) return;

      walletState.selectedId = entry.id;
      if (!skipPersist && walletState.address) {
        saveActiveHorseId(walletState.address, entry.id);
      }

      state.avatar = deepClone(entry.avatar);
      ensureAvatarSchema();
      state.tokenId = entry.tokenId || state.tokenId || generateTokenId();
      Storage.saveCurrentAvatar(state.avatar);
      Storage.saveTokenId(state.tokenId);
      refreshUI();
      if (!skipRender) {
        renderPaddockRoster();
      }
    }

    function syncActiveHorse() {
      if (!walletState.address || !walletState.selectedId) return;
      const entry = walletState.roster.find((horse) => horse.id === walletState.selectedId);
      if (!entry) return;
      entry.avatar = deepClone(state.avatar);
      entry.name = state.avatar.name;
      entry.image = state.avatar.portrait || state.avatar.image || entry.image || PLACEHOLDER_IMAGE;
      entry.tokenId = state.tokenId || entry.tokenId;
      saveRoster();
    }

    function createStableHorse() {
      if (!walletState.address) {
        updatePaddockMessage("Connect your wallet before creating stable horses.");
        return;
      }
      if (walletState.roster.length >= 4) {
        updatePaddockMessage("All stalls are occupied. Release a horse to add another.");
        return;
      }

      const avatar = createBaseAvatar();
      avatar.name = `Stable Horse #${String(walletState.roster.length + 1).padStart(3, "0")}`;
      avatar.sessions = 10;
      avatar.stats = {
        stride: rollStat(50, 70),
        endurance: rollStat(50, 70),
        force: rollStat(45, 65),
        resolve: rollStat(45, 65),
        insight: rollStat(50, 70)
      };
      avatar.mood = clamp(Math.round(70 + Math.random() * 20), 0, 100);
      avatar.portrait = PLACEHOLDER_IMAGE;
      finalizeAvatarSnapshot(avatar);

      const entry = createRosterEntryFromAvatar(avatar, {
        tokenId: generateTokenId(),
        collection: "Stable",
        image: PLACEHOLDER_IMAGE
      });

      walletState.roster.push(entry);
      saveRoster();
      applyRosterSelectionById(entry.id);
    }

    async function openNFTImport() {
      if (!walletState.address) {
        updatePaddockMessage("Connect MetaMask to import Dayjob Punk NFTs.");
        return;
      }

      if (walletState.roster.length >= 4) {
        updatePaddockMessage("All stalls are occupied. Release a horse to import a new one.");
        return;
      }

      if (!walletState.availableNFTs.length || Date.now() - walletState.lastFetch > 90_000) {
        await fetchWalletNFTs(walletState.address, { force: true });
      }

      const next = walletState.availableNFTs.find(
        (nft) => nft && !isNftImported(nft.tokenId)
      );

      if (!next) {
        updatePaddockMessage("No Dayjob Punks available to import.");
        return;
      }

      importNftIntoRoster(next);
    }

    function isNftImported(tokenId) {
      if (!tokenId) return false;
      return walletState.roster.some(
        (horse) => horse.collection === "DayJobPunks" && horse.tokenId === tokenId
      );
    }

    function importNftIntoRoster(nft) {
      if (!nft || !nft.tokenId) return;
      if (isNftImported(nft.tokenId)) {
        updatePaddockMessage("That Dayjob Punk is already in your paddock.");
        return;
      }

      const avatar = createBaseAvatar();
      const portrait = normalizeImageUrl(nft.image) || PLACEHOLDER_IMAGE;
      avatar.name = nft.name || `Dayjob Punk #${nft.tokenId}`;
      avatar.sessions = 10;
      avatar.stats = {
        stride: rollStat(60, 80),
        endurance: rollStat(60, 80),
        force: rollStat(50, 70),
        resolve: rollStat(50, 70),
        insight: rollStat(55, 75)
      };
      avatar.mood = clamp(Math.round(75 + Math.random() * 20), 0, 100);
      avatar.portrait = portrait;
      finalizeAvatarSnapshot(avatar);

      const entry = createRosterEntryFromAvatar(avatar, {
        tokenId: nft.tokenId,
        collection: "DayJobPunks",
        image: portrait
      });

      walletState.roster.push(entry);
      saveRoster();
      applyRosterSelectionById(entry.id);
      walletState.availableNFTs = walletState.availableNFTs.filter((item) => item.tokenId !== nft.tokenId);
      updatePaddockMessage();
    }

    function releaseHorse(id) {
      const index = walletState.roster.findIndex((horse) => horse.id === id);
      if (index === -1) return;
      const confirmRelease = window.confirm("Release this horse from the paddock?");
      if (!confirmRelease) return;

      const wasActive = walletState.selectedId === id;
      walletState.roster.splice(index, 1);
      saveRoster();

      if (!walletState.roster.length) {
        walletState.selectedId = null;
        if (walletState.address) {
          saveActiveHorseId(walletState.address, null);
        }
        renderPaddockRoster();
        return;
      }

      if (wasActive) {
        const nextEntry = walletState.roster[Math.max(0, index - 1)];
        applyRosterSelectionById(nextEntry.id, { skipPersist: false });
      } else {
        renderPaddockRoster();
      }
    }

    function rollStat(min, max) {
      return Math.round(min + Math.random() * (max - min));
    }

    function shortenAddress(address) {
      if (!address) return "";
      return `${address.slice(0, 6)}…${address.slice(-4)}`;
    }

    function normalizeImageUrl(url) {
      if (!url) return null;
      if (url.startsWith("ipfs://")) {
        return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
      }
      if (url.startsWith("ipfs/")) {
        return `https://ipfs.io/${url}`;
      }
      return url;
    }

    async function fetchWalletNFTs(address, { force = false } = {}) {
      if (!address) return [];
      const normalized = address.toLowerCase();
      if (!force && walletState.availableNFTs.length && Date.now() - walletState.lastFetch < 60_000) {
        return walletState.availableNFTs;
      }

      let results = [];

      try {
        results = await fetchReservoirNFTs(normalized);
      } catch (error) {
        console.warn("Reservoir lookup failed:", error);
      }

      if (!results.length) {
        try {
          results = await fetchOpenSeaNFTs(normalized);
        } catch (error) {
          console.warn("OpenSea lookup failed:", error);
        }
      }

      walletState.availableNFTs = results;
      walletState.lastFetch = Date.now();
      if (elements.importHorseBtn) {
        elements.importHorseBtn.disabled = !walletState.address || walletState.roster.length >= 4;
      }
      updatePaddockMessage();
      return results;
    }

    async function fetchReservoirNFTs(address) {
      const params = new URLSearchParams({
        contract: DAYJOB_PUNKS_CONTRACT,
        limit: "50"
      });
      const url = `https://api.reservoir.tools/users/${address}/tokens/v10?${params.toString()}`;
      const headers = {
        Accept: "application/json"
      };
      if (RESERVOIR_API_KEY) {
        headers["x-api-key"] = RESERVOIR_API_KEY;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Reservoir responded with ${response.status}`);
      }
      const data = await response.json();
      const tokens = data?.tokens || [];

      return tokens
        .map((item) => item?.token)
        .filter((token) => token?.contract?.toLowerCase() === DAYJOB_PUNKS_CONTRACT)
        .map((token) => ({
          tokenId: token.tokenId,
          name: token.name || `Dayjob Punk #${token.tokenId}`,
          image: normalizeImageUrl(token.image || token.media?.[0]?.gateway || token.metadata?.image)
        }))
        .filter((item) => item.tokenId);
    }

    async function fetchOpenSeaNFTs(address) {
      const url = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?limit=50&contract_address=${DAYJOB_PUNKS_CONTRACT}`;
      const headers = {
        Accept: "application/json"
      };
      if (OPENSEA_API_KEY) {
        headers["x-api-key"] = OPENSEA_API_KEY;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`OpenSea responded with ${response.status}`);
      }
      const data = await response.json();
      const nfts = data?.nfts || [];

      return nfts
        .map((item) => ({
          tokenId: item.identifier || item.token_id,
          name: item.name || item.collection?.name || `Dayjob Punk #${item.identifier}`,
          image: normalizeImageUrl(item.image_url || item.metadata?.image_url || item.metadata?.image)
        }))
        .filter((item) => item.tokenId);
    }
  
    function onLegacyAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;

    if (action === "revive") {
      handleReviveLegacy(id);
    }
  }

  function handleReviveLegacy(id) {
    const record = state.legacyRecords.find((entry) => entry.id === id);
    if (!record) return;

    const confirmation = window.confirm(
      `Create a new trainee inspired by ${record.name}? They will gain legacy bonuses based on this champion.`
    );
    if (!confirmation) return;

    const nextAvatar = createBaseAvatar({ legacyBonus: true, legacyData: record });
    state.avatar = nextAvatar;
    state.avatar.style = record.style || record.styleName || state.avatar.style || "Pacer";
    state.tokenId = generateTokenId();
    state.trainingLog = [];
    state.lastTrainedStat = null;

    updateAvatarProfile();

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);
      if (walletState.address) {
        const replacement = createRosterEntryFromAvatar(state.avatar, {
          tokenId: state.tokenId,
          image: state.avatar.portrait || state.avatar.image || PLACEHOLDER_IMAGE,
          collection: "Stable"
        });
        if (walletState.selectedId) {
          const index = walletState.roster.findIndex((horse) => horse.id === walletState.selectedId);
          if (index >= 0) {
            walletState.roster[index] = replacement;
          } else {
            walletState.roster.push(replacement);
          }
        } else {
          walletState.roster.push(replacement);
        }
        walletState.selectedId = replacement.id;
        saveRoster();
        saveActiveHorseId(walletState.address, replacement.id);
        renderPaddockRoster();
      }

    addTrainingLog(`Revived a trainee inspired by ${record.name}.`, "success");
    refreshUI();
    showScreen("menu");
  }

  function updateMenuState() {
    const canTrain = state.avatar.sessions > 0;
    elements.trainButton.disabled = !canTrain;
    if (elements.retireButton) {
      if (state.avatar.sessions === 0) {
        elements.retireButton.disabled = false;
        elements.retireButton.removeAttribute("hidden");
      } else {
        elements.retireButton.disabled = true;
        elements.retireButton.setAttribute("hidden", "hidden");
      }
    }
  }

  function renderTrainingLog() {
    if (!elements.trainingLog) return;
    elements.trainingLog.innerHTML = "";
    if (!state.trainingLog.length) {
      elements.trainingLog.innerHTML = `<div class="message">No sessions logged yet.</div>`;
      return;
    }

    state.trainingLog.slice(-6).forEach((entry) => {
      const div = document.createElement("div");
      div.className = `message ${entry.type || ""}`.trim();
      div.textContent = entry.text;
      elements.trainingLog.appendChild(div);
    });
  }

    function navigateScreen(target) {
      if (state.currentScreen === "race" && target !== "race") {
        stopRace();
      }
      switch (target) {
        case "training":
        case "race":
        case "paddock":
        case "retired":
          showScreen(target);
          break;
        default:
          showScreen("menu");
          break;
      }
    }

    function showScreen(screen) {
      state.currentScreen = screen;
      const screens = [
        { key: "menu", el: elements.menuScreen },
        { key: "training", el: elements.trainingScreen },
        { key: "race", el: elements.raceScreen },
        { key: "paddock", el: elements.paddockScreen },
        { key: "retired", el: elements.retiredScreen }
      ];

      console.log('[showScreen] Showing:', screen);

      screens.forEach(({ key, el }) => {
        if (!el) {
          console.warn('[showScreen] Missing element for screen:', key);
          return;
        }
        // Use inline styles to force hide/show - override all CSS
        if (key === screen) {
          el.style.display = 'flex';
          el.hidden = false;
        } else {
          el.style.display = 'none';
          el.hidden = true;
        }
        console.log(`[showScreen] ${key}: display =`, el.style.display);
      });

      switch (screen) {
        case "training":
          updateTrainingStatusUI();
          break;
        case "race":
          drawRaceIdle();
          break;
        case "paddock":
          renderPaddockRoster();
          break;
        case "retired":
          renderRetiredStable();
          break;
        default:
          break;
      }
      if (screen !== "paddock") {
        hidePaddockContextMenu();
      }
    }

  function onMenuAction(event) {
    const action = event.currentTarget.dataset.action;
    if (!action) return;

    switch (action) {
      case "train":
        showScreen("training");
        break;
      case "race":
        showScreen("race");
        break;
        case "paddock":
          showScreen("paddock");
          break;
        case "retired":
          showScreen("retired");
          break;
      case "retire":
        if (state.avatar.sessions === 0) {
          handleRetire();
        }
        break;
      case "reset":
        handleReset();
        break;
      default:
        break;
    }
  }

    function beginTrainingSession(stat) {
      if (trainingSession.active) {
        addTrainingLog("Training already in progress.", "info");
        return;
      }

      if (state.avatar.sessions <= 0) {
        addTrainingLog("No training sessions remaining.", "warn");
        updateTrainingStatusUI();
        refreshUI();
        return;
      }

      const duration = 3 + Math.random() * 2;
      trainingSession.active = true;
      trainingSession.pendingStat = stat;
      trainingSession.countdown = duration;

      setTrainingButtonsDisabled(true);
      updateTrainingTimerDisplay(duration);

      const prettyStat = stat.charAt(0).toUpperCase() + stat.slice(1);
      addTrainingLog(`Training ${prettyStat}...`, "info");

      trainingSession.intervalId = window.setInterval(() => {
        trainingSession.countdown = Math.max(0, trainingSession.countdown - 0.1);
        updateTrainingTimerDisplay();
      }, 100);

      trainingSession.timerId = window.setTimeout(() => {
        clearTrainingCountdown();
        handleTrain(stat);
      }, duration * 1000);
    }

    function clearTrainingCountdown() {
      if (trainingSession.intervalId) {
        window.clearInterval(trainingSession.intervalId);
      }
      if (trainingSession.timerId) {
        window.clearTimeout(trainingSession.timerId);
      }
      trainingSession.active = false;
      trainingSession.intervalId = null;
      trainingSession.timerId = null;
      trainingSession.countdown = 0;
      trainingSession.pendingStat = null;
      setTrainingButtonsDisabled(false);
      updateTrainingTimerDisplay(0);
    }

    function updateTrainingStatusUI() {
      if (elements.sessionsLeft) {
        elements.sessionsLeft.textContent = state.avatar.sessions;
      }
      if (!trainingSession.active) {
        updateTrainingTimerDisplay(0);
      }
    }

    function setTrainingButtonsDisabled(disabled) {
      elements.trainingButtons.forEach((button) => {
        button.disabled = disabled;
      });
    }

    function updateTrainingTimerDisplay(value = trainingSession.countdown) {
      if (!elements.trainingTimer) return;
      const display = Math.max(0, value);
      elements.trainingTimer.textContent = `${display.toFixed(1)}s`;
    }

    function handleTrain(stat) {
      if (state.avatar.sessions <= 0) {
        addTrainingLog("No training sessions remaining.", "warn");
        refreshUI();
        return;
      }

      updateAvatarProfile({ persist: false });
      const baselineProfile =
        state.avatar.profile || buildRacingProfile(state.avatar.stats, state.avatar.modifiers || {});
      const beforeProfile = deepClone(baselineProfile);
      const modifiers = state.avatar.modifiers || {};
      const legendaryLuck = modifiers.legendaryLuck || 0;
      const secondaryBonus = modifiers.secondaryBonus || 0;
      const upgradeMomentum = beforeProfile?.secondary?.upgradeMomentum || 1;
      const sameStat = state.lastTrainedStat === stat;
      const penalty = sameStat ? 0.75 : 1;
      const trainingBoost = 1 + (modifiers.trainingBonus || 0);
      const variance = 0.75 + Math.random() * (0.5 + legendaryLuck * 0.6);
      const legendBias = 1 + legendaryLuck * 0.55 + secondaryBonus * 0.35;
      const momentumBias = clamp(1 + (upgradeMomentum - 1) * 0.8, 0.7, 1.7);

      let gain = Math.round(
        TRAINING_BASE_GAIN *
          penalty *
          trainingBoost *
          (1 + secondaryBonus * 0.35) *
          variance *
          legendBias *
          momentumBias
      );
      gain = clamp(gain, 2, 22);

      playSfx("train");

      state.avatar.stats[stat] = clamp(state.avatar.stats[stat] + gain, 0, 100);

      const secondaryMap = {
        stride: "force",
        endurance: "resolve",
        force: "stride",
        resolve: "insight",
        insight: "resolve"
      };
      const synergyRatings = {
        stride: beforeProfile?.secondary?.phasePower?.start ?? beforeProfile?.secondary?.passingPower ?? 60,
        endurance: beforeProfile?.secondary?.paceControl ?? beforeProfile?.secondary?.phasePower?.middle ?? 60,
        force: beforeProfile?.secondary?.passingPower ?? beforeProfile?.secondary?.maneuverBase ?? 60,
        resolve: beforeProfile?.secondary?.fatigueResistance ?? beforeProfile?.secondary?.phasePower?.final ?? 60,
        insight: beforeProfile?.secondary?.tacticalInstinct ?? beforeProfile?.secondary?.maneuverBase ?? 60
      };
      const secondaryTarget = secondaryMap[stat];
      if (secondaryTarget) {
        const synergyRating = clamp(synergyRatings[stat] ?? 60, 0, 100);
        const secondaryChance = clamp(
          0.24 + secondaryBonus * 0.6 + legendaryLuck * 0.5 + (momentumBias - 1) * 0.45 + (synergyRating - 60) / 180,
          0,
          0.95
        );
        if (Math.random() < secondaryChance) {
          const secondaryGain = Math.max(
            1,
            Math.round(gain * (0.18 + secondaryBonus * 0.35) * (1 + (legendaryLuck + secondaryBonus) * 0.35))
          );
          state.avatar.stats[secondaryTarget] = clamp(
            (state.avatar.stats[secondaryTarget] || 0) + secondaryGain,
            0,
            100
          );
          addTrainingLog(
            `Linked stat synergy (${capitalize(secondaryTarget)} +${secondaryGain}).`,
            "info"
          );
        }
      }

      state.avatar.sessions -= 1;
      state.lastTrainedStat = stat;
      addTrainingLog(`Focused on ${capitalize(stat)}: +${gain} points.`);

      const moodShift = adjustMood(sameStat ? -7 : -5);
      if (moodShift) {
        addTrainingLog(
          `Training impact on mood ${moodShift > 0 ? "+" : ""}${moodShift}.`,
          moodShift > 0 ? "success" : "info"
        );
      }

      updateAvatarProfile({ persist: false });

      const afterProfile = state.avatar.profile || buildRacingProfile(state.avatar.stats, modifiers);
      if (beforeProfile && afterProfile) {
        const passingDiff =
          (afterProfile.aptitudes?.passing?.rating || 0) - (beforeProfile.aptitudes?.passing?.rating || 0);
        if (passingDiff >= 2) {
          addTrainingLog(`Passing aptitude improved by ${passingDiff} points.`, "info");
        }
        const beforeDistance = beforeProfile.aptitudes?.distance?.type;
        const afterDistance = afterProfile.aptitudes?.distance?.type;
        if (afterDistance && afterDistance !== beforeDistance) {
          addTrainingLog(`Distance aptitude now favors ${afterDistance} runs.`, "success");
        }
        const phaseBefore = beforeProfile.aptitudes?.phase?.focus;
        const phaseAfter = afterProfile.aptitudes?.phase?.focus;
        if (phaseAfter && phaseAfter !== phaseBefore) {
          addTrainingLog(`Race phase focus shifted toward the ${phaseAfter}.`, "info");
        }

        if (beforeProfile.secondary && afterProfile.secondary) {
          const secondaryHighlights = [];
          const trackSecondary = [
            ["Passing Power", "passingPower"],
            ["Pace Control", "paceControl"],
            ["Tactical Instinct", "tacticalInstinct"],
            ["Fatigue Resistance", "fatigueResistance"]
          ];
          trackSecondary.forEach(([label, key]) => {
            const diff = (afterProfile.secondary?.[key] || 0) - (beforeProfile.secondary?.[key] || 0);
            if (diff >= 2) {
              secondaryHighlights.push(`${label} +${diff}`);
            }
          });
          const beforePref = beforeProfile.secondary?.positioning?.preferred;
          const afterPref = afterProfile.secondary?.positioning?.preferred;
          if (afterPref && afterPref !== beforePref) {
            secondaryHighlights.push(`Positioning now favors the ${afterPref}`);
          }
          const phasePower = afterProfile.secondary?.phasePower || {};
          const prevPhasePower = beforeProfile.secondary?.phasePower || {};
          ["start", "middle", "final"].forEach((phase) => {
            const diff = (phasePower[phase] || 0) - (prevPhasePower[phase] || 0);
            if (diff >= 2) {
              secondaryHighlights.push(`${capitalize(phase)} phase energy +${diff}`);
            }
          });
          if (secondaryHighlights.length) {
            addTrainingLog(`Secondary gains: ${secondaryHighlights.join(", ")}.`, "success");
          }
        }
      }

        tryUnlockSkill(stat, modifiers);
        Storage.saveCurrentAvatar(state.avatar);
        syncActiveHorse();
        refreshUI();
        renderPaddockRoster();

      if (state.avatar.sessions === 0) {
        addTrainingLog("Training complete. Consider retiring to gain legacy bonuses.", "info");
      }
    }

    function tryUnlockSkill(stat, modifiers = {}) {
      if (state.avatar.skills.length >= 3) return;

      const insight = state.avatar.stats.insight;
      const secondaryProfile =
        state.avatar.profile?.secondary ||
        deriveSecondaryStats(state.avatar.stats, state.avatar.modifiers || {}, state.avatar.aptitudes);
      const skillProcRating = secondaryProfile?.skillProc ?? 55;
      let chance = 0.14 + Math.max(0, insight - 40) * 0.0045;
      chance += state.avatar.modifiers?.skillChanceBonus || 0;
      chance += (modifiers.legendaryLuck || 0) * 0.5;
      chance += (skillProcRating - 60) / 140;
      if (stat === "insight") {
        chance += 0.05;
      }
      chance = clamp(chance, state.avatar.legacy ? 0.28 : 0.18, 0.95);

      if (Math.random() < chance) {
        const existingNames = state.avatar.skills.map((s) => s.name);
        const rarityBias = clamp(
          (modifiers.legendaryLuck || 0) * 1.1 + (modifiers.secondaryBonus || 0) * 0.4 + (skillProcRating - 60) / 200,
          0,
          0.8
        );
        const newSkill = pickRandomSkill(existingNames, rarityBias);
        if (newSkill) {
          state.avatar.skills.push(newSkill);
          addTrainingLog(`Unlocked skill: ${newSkill.name}!`, "success");
          const uplift = adjustMood(4);
          if (uplift) {
            addTrainingLog(
              `Skill breakthrough boosted mood ${uplift > 0 ? "+" : ""}${uplift}.`,
              "success"
            );
          }
        }
      } else if (stat === "insight") {
        addTrainingLog("Insight training sharpened instincts. Skill chance increased subtly.", "info");
      } else if (chance > 0.35) {
        addTrainingLog("Close call on unlocking a skill—keep pushing those core stats!", "info");
      }
    }

  function handleRetire() {
      clearTrainingCountdown();
      const confirmRetire = window.confirm(
      "Retire this avatar? Their stats and skills will become a legacy bonus for the next trainee."
    );
    if (!confirmRetire) return;

      const record = {
        name: state.avatar.name,
        stats: deepClone(state.avatar.stats),
        skills: deepClone(state.avatar.skills),
        tokenId: state.tokenId,
        retiredAt: Date.now(),
        mood: state.avatar.mood,
        style: state.avatar.style,
        aptitudes: deepClone(state.avatar.aptitudes || {}),
        profile: deepClone(state.avatar.profile || {}),
        image: state.avatar.portrait || state.avatar.image || PLACEHOLDER_IMAGE
      };

    state.legacyRecords = Storage.addLegacyRecord(record);
      renderRetiredStable();

    const nextAvatar = createBaseAvatar({ legacyBonus: true, legacyData: record });
    state.avatar = nextAvatar;
    state.tokenId = generateTokenId();
    state.trainingLog = [];
    state.lastTrainedStat = null;

    updateAvatarProfile();

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);
      if (walletState.address) {
        const replacement = createRosterEntryFromAvatar(state.avatar, {
          tokenId: state.tokenId,
          image: state.avatar.portrait || state.avatar.image || PLACEHOLDER_IMAGE,
          collection: "Stable"
        });
        if (walletState.selectedId) {
          const index = walletState.roster.findIndex((horse) => horse.id === walletState.selectedId);
          if (index >= 0) {
            walletState.roster[index] = replacement;
          } else {
            walletState.roster.push(replacement);
          }
        } else {
          walletState.roster.push(replacement);
        }
        walletState.selectedId = replacement.id;
        saveRoster();
        saveActiveHorseId(walletState.address, replacement.id);
        renderPaddockRoster();
      }

    addTrainingLog("New legacy avatar created with boosted potential!", "success");
    refreshUI();
    showScreen("menu");
  }

  function handleReset() {
      clearTrainingCountdown();
      const confirmReset = window.confirm(
      "Reset all data? This will delete current avatar and legacy history."
    );
    if (!confirmReset) return;

    Storage.resetAll();
    state.trainingLog = [];
    state.lastTrainedStat = null;
    state.legacyRecords = [];
      if (walletState.address) {
        localStorage.removeItem(getRosterKey(walletState.address));
        localStorage.removeItem(`projectStrideRoster_${walletState.address}`);
        localStorage.removeItem(getActiveKey(walletState.address));
      }
      walletState.roster = [];
      walletState.selectedId = null;
      walletState.availableNFTs = [];
      walletState.lastFetch = 0;
      renderPaddockRoster();
    init();
  }

  function addTrainingLog(text, type = "") {
    state.trainingLog.push({ text, type });
    if (state.trainingLog.length > 10) {
      state.trainingLog.splice(0, state.trainingLog.length - 10);
    }
    renderTrainingLog();
  }

  function adjustMood(delta) {
    if (typeof state.avatar.mood !== "number") {
      state.avatar.mood = 75;
    }
    const before = Math.round(state.avatar.mood);
    const after = clamp(Math.round(before + delta), 0, 100);
    state.avatar.mood = after;
    updateMoodUI();
    return after - before;
  }

  function derivePerformanceBundle(stats) {
    return buildRacingProfile(stats).performance;
  }

    function updateAvatarProfile({ persist = false } = {}) {
      if (!state.avatar || !state.avatar.stats) return;
      const profile = buildRacingProfile(state.avatar.stats, state.avatar.modifiers || {});
      
      // Safety check - ensure profile properties exist
      if (!profile || !profile.performance) {
        console.error('[updateAvatarProfile] Invalid profile returned from buildRacingProfile');
        return;
      }
      
      console.log('[updateAvatarProfile] Generated secondary stats:', profile.secondary);
      
      state.avatar.profile = {
        performance: { ...profile.performance },
        aptitudes: profile.aptitudes ? deepClone(profile.aptitudes) : {},
        secondary: profile.secondary ? deepClone(profile.secondary) : {}
      };
      state.avatar.performance = { ...profile.performance };
      state.avatar.aptitudes = profile.aptitudes ? deepClone(profile.aptitudes) : {};
      state.avatar.secondary = profile.secondary ? deepClone(profile.secondary) : {};
      state.avatar.maneuverRating = profile.performance.maneuver;
      
      console.log('[updateAvatarProfile] Avatar secondary stats now:', state.avatar.secondary);
      
      if (persist) {
        Storage.saveCurrentAvatar(state.avatar);
      }
    }

  function applyStyleAdjustments(performance, style) {
    const adjusted = {
      speed: performance.speed,
      handling: performance.handling,
      maneuver: performance.maneuver
    };
    const modifier = STYLE_MANEUVER_ADJUST[style] || 0;
    if (modifier) {
      adjusted.maneuver = clamp(Math.round(adjusted.maneuver * (1 + modifier)), 0, 100);
    }
    return adjusted;
  }

  function getStylePhaseMultiplier(style, phase) {
    const map = STYLE_PHASE_MAP[style];
    if (!map) return 1;
    const bonus = map[phase] ?? 0;
    return 1 + bonus;
  }

  function initializeZoneState(racer, zoneIndex = DEFAULT_ZONE_INDEX) {
    const idx = Math.max(0, Math.min(ZONE_COUNT - 1, zoneIndex));
    const zone = TRACK_ZONES[idx];
    racer.zoneIndex = idx;
    racer.targetZone = idx;
    racer.zoneBlend = 0;
    racer.zoneOffset = zone.radiusOffset;
    racer.distanceMultiplier = zone.distanceMultiplier;
    racer.lane = idx;
  }

  function updateZoneState(racer, dt) {
    if (racer.zoneIndex == null) {
      initializeZoneState(racer);
    }
    if (racer.targetZone == null) {
      racer.targetZone = racer.zoneIndex;
    }
    racer.targetZone = Math.round(Math.max(0, Math.min(ZONE_COUNT - 1, racer.targetZone)));

    if (racer.zoneIndex === racer.targetZone) {
      const zone = TRACK_ZONES[racer.zoneIndex] || TRACK_ZONES[DEFAULT_ZONE_INDEX];
      racer.zoneOffset = zone.radiusOffset;
      racer.distanceMultiplier = zone.distanceMultiplier;
      racer.zoneBlend = 0;
    } else {
      const fromZone = TRACK_ZONES[racer.zoneIndex] || TRACK_ZONES[DEFAULT_ZONE_INDEX];
      const toZone = TRACK_ZONES[racer.targetZone] || TRACK_ZONES[DEFAULT_ZONE_INDEX];
      racer.zoneBlend = Math.min(1, (racer.zoneBlend || 0) + ZONE_CHANGE_RATE * dt);
      racer.zoneOffset = lerp(fromZone.radiusOffset, toZone.radiusOffset, racer.zoneBlend);
      racer.distanceMultiplier = lerp(fromZone.distanceMultiplier, toZone.distanceMultiplier, racer.zoneBlend);
      if (racer.zoneBlend >= 1 - 1e-3) {
        racer.zoneIndex = racer.targetZone;
        racer.zoneBlend = 0;
        racer.zoneOffset = toZone.radiusOffset;
        racer.distanceMultiplier = toZone.distanceMultiplier;
      }
    }

    racer.lane = Math.max(0, Math.min(ZONE_COUNT - 1, Math.round(racer.zoneIndex)));
  }

  function assignInitialLanes(racers) {
    const center = DEFAULT_ZONE_INDEX;
    let cursor = 0;
    racers.forEach((racer) => {
      const zone = racer.isPlayer ? center : cursor++ % ZONE_COUNT;
      initializeZoneState(racer, zone);
    });
  }

  function zoneLabelToIndex(label) {
    if (!label) return null;
    const normalized = String(label).toLowerCase();
    if (normalized === "inside") return 0;
    if (normalized === "outside") return ZONE_COUNT - 1;
    return DEFAULT_ZONE_INDEX;
  }

  function scheduleStrategy(racer, race, min, max) {
    const factor = clamp(racer.zoneDecisionFactorActive ?? racer.zoneDecisionFactorBase ?? 1, 0.5, 1.3);
    const duration = randomBetween(race, min, max) * factor;
    racer.strategyCooldown = Math.max(0.1, duration);
  }

  function handlePassing(race, dt) {
    const active = race.racers.filter((r) => !r.finished);
    const laneGroups = new Map();

    active.forEach((racer) => {
      racer.passCooldown = Math.max(0, (racer.passCooldown || 0) - dt);
      const laneList = laneGroups.get(racer.lane) || [];
      laneList.push(racer);
      laneGroups.set(racer.lane, laneList);
    });

    laneGroups.forEach((group) => {
      group.sort((a, b) => b.distance - a.distance);
      for (let i = 0; i < group.length - 1; i += 1) {
        const ahead = group[i];
        const behind = group[i + 1];
        if (behind.passCooldown > 0) continue;
        
        // STRATEGIC PASSING CHECKS - Don't attempt unless it makes sense!
        const staminaRatio = behind.energy / behind.maxEnergy;
        if (staminaRatio < 0.40) continue; // Don't pass if low stamina (< 40%)
        if (behind.energy <= PASS_COST_SUCCESS.max + 5) continue; // Need enough for pass + buffer
        
        const gap = (ahead.distance - behind.distance + TRACK_LENGTH) % TRACK_LENGTH;
        if (gap <= 0 || gap > PASS_DISTANCE_THRESHOLD) continue;
        
        // Only pass if you're significantly faster (10%+ speed advantage)
        const speedAdvantage = (behind.speed / ahead.speed) - 1.0;
        if (speedAdvantage < 0.10) continue; // Need 10%+ speed advantage
        
        // Check rank - don't pass if already in good position
        const rank = getRank(behind, race.leaderboard);
        if (rank <= 2 && staminaRatio < 0.60) continue; // Top 2? Save energy unless you have lots
        
        attemptPass(behind, ahead, race);
      }
    });
  }

  function decideZoneTargets(race, dt) {
    const leaderboard = race.leaderboard || [];
    const insideIndex = 0;
    const midIndex = DEFAULT_ZONE_INDEX;
    const outsideIndex = ZONE_COUNT - 1;

    const now = race.time;
    race.racers.forEach((racer) => {
      if (racer.finished) return;
      racer.strategyCooldown = Math.max(0, (racer.strategyCooldown || 0) - dt);
      if (racer.strategyCooldown > 0) return;

      const progress = (racer.distance % TRACK_LENGTH) / TRACK_LENGTH;
      const energyPct = (racer.energy / racer.maxEnergy) * 100;
      const phase = progress < START_PHASE_LIMIT ? "start" : progress < FINAL_PHASE_START ? "middle" : "final";
      const blocked = isBlockedAhead(racer, race);
      racer.isBlocked = blocked;
      if (blocked && now - (racer.lastBlockDrain || 0) > BLOCKED_DRAIN_INTERVAL) {
        spendStamina(racer, BLOCK_STAMINA_TICK, "blocked", race);
        racer.lastBlockDrain = now;
      }
      const rank = getRank(racer, leaderboard);
      
      // STICKY LANES: Stay in starting lane 80% of the time unless there's a GOOD reason to change
      let desired = racer.startingLane; // Default to starting lane!
      const currentLane = racer.zoneIndex ?? midIndex;
      
      const aggression = racer.aggressionRating ?? racer.secondary?.aggression ?? 60;
      const tactical = racer.secondary?.tacticalInstinct ?? racer.skillProcRating ?? 60;
      const preferredLane = racer.preferredLane || racer.secondary?.positioning?.preferred || null;

      // ONLY change lanes if blocked OR overtaking OR final sprint
      if (phase === "start") {
        // Stay in starting lane during start phase
        desired = racer.startingLane;
        scheduleStrategy(racer, race, 2.0, 4.0); // Longer cooldown!
      } else if (phase === "middle") {
        if (blocked && energyPct > 40) {
          // Only move if blocked AND have energy
          if (racer.stats.insight > 60 && racer.performance.maneuver > 55) {
            desired = Math.min(outsideIndex, currentLane + 1);
          } else {
            desired = currentLane; // Stay put if can't maneuver well
          }
        } else {
          // Not blocked? Stay in your lane!
          desired = racer.startingLane;
        }
        scheduleStrategy(racer, race, 3.0, 5.0); // Much longer cooldown!
      } else {
        // Final phase - ONLY change if overtaking or clear benefit
        if (rank === 1 && !blocked && energyPct > 40) {
          desired = insideIndex; // Leader takes inside line
        } else if (blocked && energyPct > 30) {
          desired = outsideIndex; // Move outside to overtake
        } else {
          desired = racer.startingLane; // Otherwise stay in lane!
        }
        scheduleStrategy(racer, race, 2.0, 4.0);
      }

      const phaseFocus = racer.aptitudes?.phase?.focus;
      if (!blocked) {
        if (phase === "final" && phaseFocus === "final" && energyPct > 40) {
          desired = insideIndex;
        } else if (phase === "start" && phaseFocus === "start") {
          desired = insideIndex;
        } else if (phase === "middle" && phaseFocus === "middle") {
          desired = midIndex;
        }
      }

      const biasSource = racer.zoneBiasActive ?? racer.zoneBiasPassive;
      const biasPhase = racer.zoneBiasActive ? racer.zoneBiasActivePhase : racer.zoneBiasPhase;
      if (biasSource && (!biasPhase || biasPhase === phase)) {
        const biasIndex = zoneLabelToIndex(biasSource);
        if (biasIndex !== null) {
          desired = biasIndex;
        }
      }

        if (!blocked && preferredLane) {
          const prefIndex = zoneLabelToIndex(preferredLane);
          if (prefIndex !== null) {
            const steerChance = clamp((tactical - 50) / 120, 0, 0.65);
            if (sampleRng(race) < steerChance) {
              desired = prefIndex;
            }
          }
        }

      desired = Math.max(0, Math.min(outsideIndex, desired));
      if (desired !== racer.targetZone) {
        racer.targetZone = desired;
        racer.zoneBlend = 0;
      }
    });
  }

  function isBlockedAhead(racer, race) {
    const threshold = 18;
    for (const other of race.racers) {
      if (other === racer || other.finished) continue;
      const gap = (other.distance - racer.distance + TRACK_LENGTH) % TRACK_LENGTH;
      if (gap <= 0 || gap > threshold) continue;
      const zoneSeparation = Math.abs((other.zoneOffset || 0) - (racer.zoneOffset || 0));
      if (zoneSeparation < 24) {
        return true;
      }
    }
    return false;
  }

  function getRank(racer, leaderboard) {
    if (!leaderboard || !leaderboard.length) return Number.POSITIVE_INFINITY;
    const index = leaderboard.findIndex((entry) => entry.id === racer.id);
    return index >= 0 ? index + 1 : leaderboard.length + 1;
  }

  function attemptPass(behind, ahead, race) {
    const racerStyle = behind.style || "Pacer";
      const behindManeuver = behind.secondary?.maneuverBase ?? behind.performance.maneuver;
      const aheadManeuver = ahead.secondary?.maneuverBase ?? ahead.performance.maneuver;
      const passingPower = behind.secondary?.passingPower ?? behind.performance.maneuver;
      let passChance = clamp(
        behindManeuver / 100 + (behind.passBonus || 0) + (passingPower - 60) / 180,
        0.05,
        0.99
      );
    if (behind.predictive) {
      passChance = Math.min(0.99, passChance + 0.05);
    }

      const maneuverAdvantage = behindManeuver >= aheadManeuver + 2;
    const speedAdvantage = behind.performance.speed >= ahead.performance.speed + 2;
    const progress = (behind.distance % TRACK_LENGTH) / TRACK_LENGTH;
    if (progress >= FINAL_PHASE_START) {
      passChance = Math.min(0.99, passChance + (behind.stats.force + behind.stats.insight) / 400);
    }

    const insightBoost = behind.insightBonusActive ?? behind.insightBonusBase ?? 0;
    if (insightBoost) {
      passChance = clamp(passChance + insightBoost, 0.05, 0.99);
    }

      if (behind.aggressionRating) {
        passChance = clamp(passChance + (behind.aggressionRating - 60) / 300, 0.05, 0.99);
      }

      if (ahead.secondary?.fatigueResistance) {
        passChance = clamp(passChance - (ahead.secondary.fatigueResistance - 65) / 320, 0.05, 0.99);
      }

    const roll = sampleRng(race);
    let success = maneuverAdvantage || speedAdvantage || roll < passChance;

    behind.lastPassAttempt = race.time;
    const baseCooldown = randomBetween(race, PASS_COOLDOWN_MIN, PASS_COOLDOWN_MAX);
    const cooldown = baseCooldown * (behind.cooldownFactor || 1);
    behind.passCooldown = cooldown;

    if (success && ahead.defenseBonus) {
      const defenseRoll = sampleRng(race);
      if (defenseRoll < ahead.defenseBonus) {
        success = false;
        console.log(
          `%cDefended%c ${ahead.name} held the line against ${behind.name}.`,
          "color:#ffd166; font-weight:bold;",
          "color:#d0d3e8"
        );
      }
    }

    if (success && ahead.blocker) {
      const blockRoll = sampleRng(race);
      if (blockRoll < 0.45) {
        success = false;
        console.log(
          `%cBlock Attempt%c ${ahead.name} cut off ${behind.name}.`,
          "color:#f29e4c; font-weight:bold;",
          "color:#d0d3e8"
        );
      }
    }

      if (success) {
      const offsets = [];
      if (behind.lane < LANE_COUNT - 1) offsets.push(behind.lane + 1);
      if (behind.lane > 0) offsets.push(behind.lane - 1);
      let chosenLane = behind.lane;
      if (offsets.length) {
        chosenLane =
          offsets.find(
            (lane) =>
              !race.racers.some(
                (r) =>
                  r !== behind &&
                  !r.finished &&
                  r.lane === lane &&
                  Math.min(
                    Math.abs(r.distance - behind.distance),
                    TRACK_LENGTH - Math.abs(r.distance - behind.distance)
                  ) < 5
              )
          ) ?? offsets[0];
      }
      behind.targetZone = chosenLane;
      behind.zoneIndex = chosenLane;
      const zoneInfo = TRACK_ZONES[chosenLane];
      if (zoneInfo) {
        behind.zoneOffset = zoneInfo.radiusOffset;
        behind.distanceMultiplier = zoneInfo.distanceMultiplier;
      }
      behind.zoneBlend = 0;
      behind.lane = chosenLane;
      behind.distance += 1;
        behind.passCooldown = cooldown;
      spendStamina(behind, randomBetween(race, PASS_COST_SUCCESS.min, PASS_COST_SUCCESS.max), "pass_success", race);
      spendStamina(ahead, BLOCK_DEFENSE_COST, "passed", race);
      scheduleStrategy(ahead, race, PASS_COOLDOWN_MIN * 0.5, PASS_COOLDOWN_MIN);
      scheduleStrategy(behind, race, 0.3, 0.6);
      console.log(
        `%cPass Success%c ${behind.name} (${racerStyle}) moved to ${TRACK_ZONES[behind.lane]?.display || "outer lane"}`,
        "color:#58d68d; font-weight:bold;",
        "color:#d0d3e8"
      );
    } else {
      let slowdown = 0.95 - sampleRng(race) * 0.05;
      if (behind.recoveryFactor) {
        const penalty = 1 - slowdown;
        slowdown = 1 - penalty * behind.recoveryFactor;
      }
      behind.speed *= slowdown;
      scheduleStrategy(behind, race, 0.5, 0.8);
      spendStamina(behind, randomBetween(race, PASS_COST_FAIL.min, PASS_COST_FAIL.max), "pass_fail", race);
      spendStamina(ahead, BLOCK_DEFENSE_COST * 0.5, "defend", race);
      console.log(
        `%cPass Blocked%c ${behind.name} (${racerStyle}) slowed (${(slowdown * 100).toFixed(0)}%)`,
        "color:#f85149; font-weight:bold;",
        "color:#d0d3e8"
      );
    }
  }

  function generateTrackConditions() {
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

  function showStrategyModal() {
    const modal = document.getElementById('strategy-modal');
    if (!modal) return;
    
    // Generate track conditions
    const conditions = generateTrackConditions();
    state.currentTrackConditions = conditions;
    
    // Display track conditions
    const conditionsDisplay = document.getElementById('track-conditions-display');
    if (conditionsDisplay) {
      const trackLabels = {
        clean: 'Clean',
        slightly_dirty: 'Slightly Dirty',
        muddy: 'Muddy'
      };
      const weatherLabels = {
        sunny: '☀️ Sunny',
        overcast: '☁️ Overcast',
        rainy: '🌧️ Rainy'
      };
      
      const speedEffect = ((conditions.speedModifier - 1) * 100).toFixed(0);
      const staminaEffect = ((conditions.staminaModifier - 1) * 100).toFixed(0);
      const speedText = speedEffect >= 0 ? `+${speedEffect}%` : `${speedEffect}%`;
      const staminaText = staminaEffect >= 0 ? `+${staminaEffect}%` : `${staminaEffect}%`;
      
      conditionsDisplay.innerHTML = `
        <h4>🏁 Track Conditions</h4>
        <div class="condition-item">
          <span class="condition-label">Track State:</span>
          <span class="condition-value">${trackLabels[conditions.trackState]}</span>
        </div>
        <div class="condition-item">
          <span class="condition-label">Weather:</span>
          <span class="condition-value">${weatherLabels[conditions.weather]}</span>
        </div>
        <div class="condition-effects">
          <div class="condition-warning">Effects: Speed ${speedText}, Stamina Drain ${staminaText}</div>
          <div style="font-size: 0.8rem; margin-top: 4px;">High adaptability reduces penalties!</div>
        </div>
      `;
    }
    
    // Show modal
    modal.hidden = false;
    modal.style.display = 'flex';
    
    // Add strategy button listeners
    const strategyButtons = modal.querySelectorAll('.strategy-btn');
    strategyButtons.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.replaceWith(newBtn);
      newBtn.addEventListener('click', () => {
        const strategy = newBtn.dataset.strategy;
        selectStrategy(strategy);
      });
    });
  }

  function selectStrategy(strategy) {
    console.log(`[Strategy] Player selected: ${strategy}`);
    state.selectedStrategy = strategy;
    
    // Hide modal
    const modal = document.getElementById('strategy-modal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    
    // Start race with selected strategy
    startRace(false);
  }

  function startRace(isReplay) {
    if (state.race && state.race.running) {
      return;
    }

    const config = isReplay && state.lastRaceConfig ? state.lastRaceConfig : createRaceConfig();
    if (!config) return;

    state.lastRaceConfig = deepClone(config);
    state.race = createRaceInstance(config);
    state.race.isReplay = isReplay;
    state.race.running = false;
    state.race.loopActive = true;
    state.race.countdown = 3;
    state.race.countdownTimer = 0;
    state.race.countdownActive = true;
    state.race.countdownLabel = "3";
    state.race.countdownFlashTimer = 0;
    playSfx("countdown");
    if (!state.race.loggedRoster) {
      logRaceRoster(state.race);
      state.race.loggedRoster = true;
    }
    const playerRacer = state.race.racers.find((r) => r.isPlayer);
    updateHud(playerRacer, state.race);
    drawRace(state.race);
    elements.startRace.disabled = true;
    runRaceLoop();
  }

  function createRaceConfig() {
    const seed = Date.now();
    const seedRng = createSeededRng(seed);
    updateAvatarProfile();
    const aiBlueprints = Array.from({ length: 3 }, (_, index) =>
      createAIRacer(index, state.avatar.stats, seedRng)
    ).map((blueprint) => deepClone(blueprint));

      const playerProfile =
        state.avatar.profile || buildRacingProfile(state.avatar.stats, state.avatar.modifiers || {});

    return {
      seed,
      aiBlueprints,
      playerSnapshot: {
        name: state.avatar.name,
        stats: deepClone(state.avatar.stats),
        skills: deepClone(state.avatar.skills),
        modifiers: deepClone(state.avatar.modifiers || { trainingBonus: 0, skillChanceBonus: 0 }),
        mood: state.avatar.mood,
        style: state.avatar.style,
        performance: deepClone(playerProfile.performance),
        aptitudes: deepClone(playerProfile.aptitudes),
          profile: deepClone(playerProfile),
          secondary: deepClone(playerProfile.secondary)
      }
    };
  }

  function createRaceInstance(config) {
    const rng = createSeededRng(config.seed);

    const racers = [];
    const player = buildRacer({
      id: "player",
      name: config.playerSnapshot.name,
      color: "#64b5f6",
      stats: config.playerSnapshot.stats,
      skills: config.playerSnapshot.skills,
      modifiers: config.playerSnapshot.modifiers,
      isPlayer: true,
      style: config.playerSnapshot.style || "Pacer",
      mood: config.playerSnapshot.mood,
      performance: config.playerSnapshot.performance,
      profile: config.playerSnapshot.profile,
      aptitudes: config.playerSnapshot.aptitudes
    });
    player.startAggro = rng();
    const playerDecisionFactor = clamp(player.zoneDecisionFactorBase ?? 1, 0.5, 1.3);
    player.strategyCooldown = (0.2 + rng() * 0.3) * playerDecisionFactor;
    applyRacePerformanceAdjustments(player, rng);
    racers.push(player);

    config.aiBlueprints.forEach((blueprint, index) => {
      const aiRacer = buildRacer({
        id: `ai-${index}`,
        name: blueprint.name,
        color: blueprint.color,
        stats: blueprint.stats,
        skills: blueprint.skills,
        modifiers: blueprint.modifiers,
        isPlayer: false,
        style: blueprint.style || blueprint.styleName || "Pacer",
        styleName: blueprint.styleName,
        mood: blueprint.mood,
        performance: blueprint.performance,
        profile: blueprint.profile,
        aptitudes: blueprint.aptitudes
      });
      aiRacer.startAggro = rng();
      const aiDecisionFactor = clamp(aiRacer.zoneDecisionFactorBase ?? 1, 0.5, 1.3);
      aiRacer.strategyCooldown = (0.3 + rng() * 0.5) * aiDecisionFactor;
      applyRacePerformanceAdjustments(aiRacer, rng);
      racers.push(aiRacer);
    });

    // Lanes are now assigned in buildRacer() with random assignment
    // assignInitialLanes(racers);

    return {
      seed: config.seed,
      rng,
      racers,
      time: 0,
      accumulator: 0,
      running: false,
      loopActive: false,
      countdownActive: false,
      countdown: 3,
      countdownTimer: 0,
      countdownFlashTimer: 0,
      countdownLabel: "3",
      finishedOrder: [],
      animationId: null,
      aiBlueprints: deepClone(config.aiBlueprints),
      playerSnapshot: deepClone(config.playerSnapshot),
      leaderboard: racers.slice(),
      debugPhase: null,
      loggedRoster: false,
      trackConditions: state.currentTrackConditions || { speedModifier: 1.0, staminaModifier: 1.0 },
      trackLength: TRACK_LENGTH
    };
  }

    function buildRacer({
      id,
      name,
      color,
      stats,
      skills,
      modifiers,
      isPlayer,
      style,
      styleName,
      mood,
      performance,
      profile,
      aptitudes
    }) {
    const maxEnergy = 100 + stats.endurance * 10;
    
    // Override style with selected strategy (only for player)
    let useStyle = style || "Pacer";
    if (isPlayer && state.selectedStrategy) {
      useStyle = state.selectedStrategy;
      console.log(`[Strategy Override] Player using: ${useStyle} (selected in modal)`);
    }
    const styleLabel = styleName || useStyle;
    
    // Random starting lane assignment
    const startingLanes = [0, 1, 2]; // Inside, Mid, Outside
    const randomLane = startingLanes[Math.floor(Math.random() * startingLanes.length)];
    
    // Starting break variance based on Insight stat
    const insightStat = stats.insight || 50;
    const breakVariance = (Math.random() - 0.5) * (1 - insightStat / 150);
    // High insight = better reaction (-0.17 to +0.17s for insight 100)
    // Low insight = worse reaction (-0.43 to +0.43s for insight 20)
    
    console.log(`[Starting Setup] ${name} - Lane: ${randomLane}, Break Delay: ${breakVariance.toFixed(3)}s`);
      const effectiveModifiers = modifiers
        ? { ...modifiers }
        : {
            trainingBonus: 0,
            skillChanceBonus: 0,
            legendaryLuck: 0,
            secondaryBonus: 0
          };
      const baseProfile = profile ? deepClone(profile) : buildRacingProfile(stats, effectiveModifiers);
      const perfSource = performance ? { ...performance } : { ...baseProfile.performance };
    const baseAptitudes = aptitudes
      ? deepClone(aptitudes)
        : baseProfile.aptitudes || deriveAptitudes(stats, perfSource);
      const secondaryProfile =
        baseProfile.secondary || deriveSecondaryStats(stats, effectiveModifiers, baseAptitudes);
    const maneuverAdjusted = applyStyleAdjustments(perfSource, useStyle);
    // Reduced speed stat dominance for closer races
    // Apply track conditions with adaptability
    const trackConditions = state.currentTrackConditions || { speedModifier: 1.0, staminaModifier: 1.0 };
    const trackAdaptability = secondaryProfile?.trackAdaptability || 60;
    const adaptabilityFactor = trackAdaptability / 100; // 0.35 to 0.95
    
    // High adaptability reduces penalties
    const speedPenalty = (1 - trackConditions.speedModifier);
    const staminaPenalty = (trackConditions.staminaModifier - 1);
    
    const adjustedSpeedMod = 1 - (speedPenalty * (1 - adaptabilityFactor * 0.6));
    const adjustedStaminaMod = 1 + (staminaPenalty * (1 - adaptabilityFactor * 0.5));
    
    if (isPlayer) {
      console.log(`[Track Conditions] Adaptability: ${trackAdaptability}, Speed: ${(adjustedSpeedMod * 100).toFixed(1)}%, Stamina: ${(adjustedStaminaMod * 100).toFixed(1)}%`);
    }
    
    const baseSpeed = Math.max(4, 4.2 + maneuverAdjusted.speed * 0.025) * adjustedSpeedMod; // Closer speed ranges!
    const acceleration = 4 + maneuverAdjusted.speed * 0.04;
    const handlingFactor = 1 + maneuverAdjusted.handling / 220;
    const maxSpeed = baseSpeed * handlingFactor;
    // BALANCED DRAIN: Target 40-60% stamina at finish
  const staminaDrain = Math.max(0.08, (0.35 + stats.stride / 180 - stats.endurance / 250) * 5.5) * adjustedStaminaMod;

    const racerObj = {
      id,
      name,
      color,
      stats: deepClone(stats),
      skills: skills.map((skill) => ({
        ...deepClone(skill),
        active: false,
        timer: 0,
        used: false
      })),
        modifiers: effectiveModifiers,
      style: useStyle,
      styleName: styleLabel,
      isPlayer,
      distance: 0,
      speed: 0,
      energy: maxEnergy,
      maxEnergy,
      phase: "start",
      finished: false,
      finishTime: null,
      depleted: false,
      skillLog: [],
      rngModifier: 0,
      mood,
      skillToast: null,
      energyHistory: [{ time: 0, energy: 100 }],
      energySampleTimer: 0,
      performance: maneuverAdjusted,
      profile: {
        performance: perfSource,
        aptitudes: deepClone(baseAptitudes)
      },
      aptitudes: deepClone(baseAptitudes),
      baseSpeed,
      maxSpeed,
      acceleration,
      lane: randomLane,
      startingLane: randomLane,
      startingBreakDelay: breakVariance,
      hasStarted: false,
      passCooldown: 0,
      strategyCooldown: 0,
      startAggro: 0,
      lastPhaseLogged: null,
      baseDrain: staminaDrain,
      fatigueThreshold: maxEnergy * 0.3,
      finalBurst: false,
      finalBurstTimer: 0,
      lastPassAttempt: 0,
      sprintMode: false,
      sprintTimer: 0,
      sprintCooldown: 0,
      sprintsUsed: 0,
      sprinterFinalPhaseLogged: false,
      sprinterExplosionLogged: false,
      chaserStrategyActive: false,
      pacerStrategyActive: false,
      leaderStrategyActive: false,
      isBlocked: false,
      lowStaminaNotified: false,
      lastBlockDrain: 0,
      zoneBiasPassive: null,
      zoneBiasPhase: null,
      zoneBiasActive: null,
      zoneBiasActivePhase: null,
      staminaShieldBase: 1,
      staminaShieldActive: 1,
      focusDrainFactorBase: 1,
      focusDrainFactorActive: 1,
      insightBonusBase: 0,
      insightBonusActive: 0,
      zoneDecisionFactorBase: 1,
        zoneDecisionFactorActive: 1,
        secondary: deepClone(secondaryProfile),
        skillProcRating: secondaryProfile?.skillProc ?? 55,
        upgradeMomentum: secondaryProfile?.upgradeMomentum ?? 1,
        aggressionRating: secondaryProfile?.aggression ?? 60,
        phasePowerProfile: deepClone(secondaryProfile?.phasePower || {}),
        preferredLane: secondaryProfile?.positioning?.preferred || null
    };
    applyPassiveSkills(racerObj);
    applyAptitudeModifiers(racerObj);
      applySecondarySynergy(racerObj);
    initializeZoneState(racerObj, DEFAULT_ZONE_INDEX);
    
    // 🔍 DEBUG: Log complete racer build stats (AFTER all modifications)
    console.log(`\n🏇 [RACER BUILD] ${name} (${useStyle})`);
    console.log(`  📊 Primary Stats: Stride=${stats.stride}, End=${stats.endurance}, Force=${stats.force}, Resolve=${stats.resolve}, Insight=${stats.insight}`);
    console.log(`  ⚡ Performance: Speed=${maneuverAdjusted.speed}, Handling=${maneuverAdjusted.handling}, Maneuver=${maneuverAdjusted.maneuver}`);
    console.log(`  🏎️ FINAL Base Speed: ${racerObj.baseSpeed.toFixed(3)}, Max Speed: ${racerObj.maxSpeed.toFixed(3)}, Acceleration: ${racerObj.acceleration.toFixed(2)}`);
    console.log(`  💧 Stamina Drain: ${staminaDrain.toFixed(3)}/s, Max Energy: ${maxEnergy}`);
    console.log(`  🚀 Sprint - Power: ${secondaryProfile?.sprintPower || 60}, Efficiency: ${secondaryProfile?.sprintEfficiency || 60}, Frequency: ${secondaryProfile?.burstFrequency || 60}`);
    console.log(`  💚 Stamina Recovery: ${secondaryProfile?.staminaRecovery || 60}`);
    console.log(`  🎯 Secondary Stats: Passing=${secondaryProfile?.passingPower || 60}, Pace=${secondaryProfile?.paceControl || 60}, Fatigue=${secondaryProfile?.fatigueResistance || 60}`);
    console.log(`  🎲 Skills: ${skills.map(s => `${s.name} (${s.trigger})`).join(', ') || 'None'}\n`);
    
    // 🔒 LOCK baseSpeed - prevent ANY mid-race modifications!
    Object.defineProperty(racerObj, 'baseSpeed', {
      value: racerObj.baseSpeed,
      writable: false,
      configurable: false
    });
    
    return racerObj;
  }

  function applyPassiveSkills(racer) {
    racer.passBonus = 0;
    racer.defenseBonus = 0;
    racer.cooldownFactor = 1;
    racer.slipstreamBonus = 0;
    racer.recoveryFactor = 1;
    racer.energyDrainFactor = 1;
    racer.coolRecoveryRate = 0;
    racer.blocker = false;
    racer.predictive = false;
    racer.adaptiveFactor = 1;
    racer.jitterFactor = 1;
    racer.handlingBonus = 0;
    racer.handlingPenaltyBase = 1;
    racer.handlingPenaltyActive = 1;
    racer.zoneBiasPassive = null;
    racer.zoneBiasPhase = null;
    racer.zoneBiasActive = null;
    racer.zoneBiasActivePhase = null;
    racer.staminaShieldBase = 1;
    racer.staminaShieldActive = 1;
    racer.focusDrainFactorBase = 1;
    racer.focusDrainFactorActive = 1;
    racer.insightBonusBase = 0;
    racer.insightBonusActive = 0;
    racer.zoneDecisionFactorBase = 1;
    racer.zoneDecisionFactorActive = 1;

    (racer.skills || []).forEach((skill) => {
      if (!skill) return;
      const effect = skill.effect || {};
      if (effect.passBonus) {
        racer.passBonus += effect.passBonus;
      }
      if (effect.slipstreamBonus) {
        racer.slipstreamBonus = Math.max(racer.slipstreamBonus, effect.slipstreamBonus);
      }
      if (effect.defenseBonus) {
        racer.defenseBonus = Math.max(racer.defenseBonus, effect.defenseBonus);
      }
      if (effect.recoveryFactor) {
        racer.recoveryFactor = Math.min(racer.recoveryFactor, effect.recoveryFactor);
      }
      if (effect.adaptiveFactor) {
        racer.adaptiveFactor *= effect.adaptiveFactor;
      }
      if (effect.riskPenalty) {
        skill.riskPenalty = true;
      }
      if (effect.handlingBonus) {
        racer.handlingBonus += effect.handlingBonus;
      }
      if (effect.jitterFactor) {
        racer.jitterFactor *= effect.jitterFactor;
      }
      if (effect.energyDrainFactor) {
        racer.energyDrainFactor *= effect.energyDrainFactor;
      }
      if (effect.block) {
        racer.blocker = true;
      }
      if (effect.cooldownFactor) {
        racer.cooldownFactor *= effect.cooldownFactor;
      }
      if (effect.predictive) {
        racer.predictive = true;
      }
      if (effect.coolRecoveryRate) {
        racer.coolRecoveryRate = Math.max(racer.coolRecoveryRate, effect.coolRecoveryRate);
      }
      if (effect.zoneBias) {
        racer.zoneBiasPassive = effect.zoneBias;
        racer.zoneBiasPhase = effect.zonePhase || null;
      }
      if (effect.staminaShield) {
        racer.staminaShieldBase = Math.min(racer.staminaShieldBase, effect.staminaShield);
      }
      if (effect.focusDrain) {
        racer.focusDrainFactorBase *= effect.focusDrain;
      }
      if (effect.insightBonus) {
        racer.insightBonusBase += effect.insightBonus;
      }
      if (effect.zoneDecisionFactor) {
        racer.zoneDecisionFactorBase *= effect.zoneDecisionFactor;
      }

      // Active skill defaults
      if (skill.type === "active") {
        if (!skill.trigger) skill.trigger = "final";
        if (typeof skill.duration !== "number") skill.duration = 3;
        if (typeof skill.boost !== "number") skill.boost = 0.15;
      }
    });

    racer.passBonus = Math.min(racer.passBonus, 0.45);
    racer.cooldownFactor = Math.max(0.6, Math.min(racer.cooldownFactor, 1.2));
    racer.defenseBonus = Math.min(Math.max(racer.defenseBonus, 0), 0.6);
    racer.recoveryFactor = Math.max(0.3, Math.min(racer.recoveryFactor, 1));
    racer.energyDrainFactor = Math.max(0.4, Math.min(racer.energyDrainFactor, 1.2));
    racer.slipstreamBonus = Math.max(0, Math.min(racer.slipstreamBonus, 0.12));
    racer.coolRecoveryRate = Math.max(0, Math.min(racer.coolRecoveryRate, 0.05));
    racer.staminaShieldBase = Math.max(0.5, Math.min(racer.staminaShieldBase, 1));
    racer.focusDrainFactorBase = Math.max(0.6, Math.min(racer.focusDrainFactorBase, 1.2));
    racer.zoneDecisionFactorBase = Math.max(0.6, Math.min(racer.zoneDecisionFactorBase, 1.3));
    racer.insightBonusBase = clamp(racer.insightBonusBase, 0, 0.2);
    racer.staminaShieldActive = racer.staminaShieldBase;
    racer.focusDrainFactorActive = racer.focusDrainFactorBase;
    racer.zoneDecisionFactorActive = racer.zoneDecisionFactorBase;
    racer.insightBonusActive = racer.insightBonusBase;
    racer.zoneBiasActive = racer.zoneBiasPassive;
    racer.zoneBiasActivePhase = racer.zoneBiasPhase;
    if (racer.handlingBonus) {
      racer.maxSpeed *= 1 + racer.handlingBonus;
    }
    racer.acceleration *= racer.adaptiveFactor;
    racer.handlingPenaltyActive = racer.handlingPenaltyBase;
  }

  function applyAptitudeModifiers(racer) {
    const apt = racer.aptitudes || {};
    if (apt.staminaReserve != null) {
      racer.staminaShieldBase = Math.min(racer.staminaShieldBase, apt.staminaReserve);
      racer.staminaShieldActive = racer.staminaShieldBase;
    }
    if (apt.focusDiscipline != null) {
      racer.focusDrainFactorBase *= apt.focusDiscipline;
      racer.focusDrainFactorActive = racer.focusDrainFactorBase;
    }
    if (apt.distance?.score) {
      const distanceBoost = clamp((apt.distance.score - 60) / 400, -0.05, 0.08);
      const accelBoost = clamp((apt.distance.score - 60) / 500, -0.04, 0.06);
      racer.baseSpeed *= 1 + distanceBoost;
      racer.maxSpeed *= 1 + distanceBoost;
      racer.acceleration *= 1 + accelBoost;
    }
    if (apt.surface?.adaptability != null) {
      const surfaceFactor = clamp(1 - (apt.surface.adaptability - 60) / 300, 0.85, 1.1);
      racer.energyDrainFactor *= surfaceFactor;
      racer.energyDrainFactor = clamp(racer.energyDrainFactor, 0.4, 1.2);
    }
    if (apt.decisionFactor != null) {
      const factor = clamp(apt.decisionFactor, 0.5, 1.3);
      racer.zoneDecisionFactorBase = factor;
      racer.zoneDecisionFactorActive = factor;
    }
    if (apt.passing?.rating) {
      const passingDelta = clamp((apt.passing.rating - 60) / 400, -0.05, 0.12);
      racer.passBonus += passingDelta;
      const insightBoost = clamp((apt.passing.rating - 65) / 500, -0.02, 0.08);
      racer.insightBonusBase += insightBoost;
      racer.insightBonusActive = racer.insightBonusBase;
    }
    if (apt.passing?.laneBias && !racer.zoneBiasPassive) {
      racer.zoneBiasPassive = apt.passing.laneBias;
      racer.zoneBiasPhase = apt.phase?.focus || racer.zoneBiasPhase;
    }
    if (apt.passing?.aggression) {
      const aggro = clamp((apt.passing.aggression - 40) / 120, 0, 1);
      racer.startAggro = Math.max(racer.startAggro || 0, aggro);
    }
    racer.passBonus = clamp(racer.passBonus, -0.05, 0.5);
    racer.focusDrainFactorBase = clamp(racer.focusDrainFactorBase, 0.4, 1.2);
    racer.focusDrainFactorActive = clamp(racer.focusDrainFactorActive, 0.4, 1.2);
  }

    function applySecondarySynergy(racer) {
      const secondary = racer.secondary || {};
      if (!secondary || Object.keys(secondary).length === 0) {
        return;
      }

      const passingDelta = clamp((secondary.passingPower - 60) / 180, -0.04, 0.22);
      racer.passBonus += passingDelta;

      const tacticalDelta = clamp((secondary.tacticalInstinct - 60) / 240, -0.02, 0.12);
      racer.insightBonusBase += tacticalDelta;
      racer.insightBonusActive = racer.insightBonusBase;

      const paceFactor = clamp(1 - (secondary.paceControl - 60) / 260, 0.75, 1.15);
      racer.energyDrainFactor *= paceFactor;

      const fatigueShield = clamp(1 - (secondary.fatigueResistance - 60) / 220, 0.55, 1.05);
      racer.staminaShieldBase = Math.min(racer.staminaShieldBase, fatigueShield);
      racer.staminaShieldActive = racer.staminaShieldBase;

      const decisionFactor = clamp(1 - (secondary.tacticalInstinct - 60) / 320, 0.7, 1.2);
      racer.zoneDecisionFactorBase *= decisionFactor;
      racer.zoneDecisionFactorActive = racer.zoneDecisionFactorBase;

      if (!racer.zoneBiasPassive && secondary.positioning?.preferred) {
        racer.zoneBiasPassive = secondary.positioning.preferred;
      }

      racer.aggressionRating = secondary.aggression ?? racer.aggressionRating;
      racer.skillProcRating = secondary.skillProc ?? racer.skillProcRating;
      racer.phasePowerProfile = deepClone(secondary.phasePower || racer.phasePowerProfile || {});
      racer.preferredLane = racer.preferredLane || secondary.positioning?.preferred || null;

      racer.passBonus = clamp(racer.passBonus, -0.05, 0.5);
      racer.energyDrainFactor = clamp(racer.energyDrainFactor, 0.4, 1.25);
      racer.zoneDecisionFactorBase = clamp(racer.zoneDecisionFactorBase, 0.6, 1.3);
      racer.zoneDecisionFactorActive = racer.zoneDecisionFactorBase;
      racer.insightBonusBase = clamp(racer.insightBonusBase, 0, 0.25);
      racer.insightBonusActive = racer.insightBonusBase;
    }

  function spendStamina(racer, amount, reason, race) {
    if (!racer || !amount) return;
    const cost = Math.max(0, amount);
    racer.energy = Math.max(0, racer.energy - cost);
    if (racer.energy <= racer.fatigueThreshold * 0.35 && !racer.lowStaminaNotified) {
      console.log(`%cStamina Low%c ${racer.name} is fading (${Math.round((racer.energy / racer.maxEnergy) * 100)}%)`, "color:#ff6b6b; font-weight:bold;", "color:#d0d3e8");
      racer.lowStaminaNotified = true;
    }
    if (racer.energy > racer.fatigueThreshold * 0.6) {
      racer.lowStaminaNotified = false;
      if (racer.energy > racer.fatigueThreshold) {
        racer.depleted = false;
      }
    }
  }

  function recoverStamina(racer, amount) {
    if (!racer || !amount) return;
    racer.energy = Math.min(racer.maxEnergy, racer.energy + amount);
    if (racer.energy > racer.fatigueThreshold * 0.6) {
      racer.lowStaminaNotified = false;
      if (racer.energy > racer.fatigueThreshold) {
        racer.depleted = false;
      }
    }
  }

  function getCurrentTrackSection(progress) {
    for (const section of TRACK_SECTIONS) {
      if (progress >= section.start && progress < section.end) {
        return section;
      }
    }
    return TRACK_SECTIONS[0]; // Default to first section
  }

  function decideSprint(racer, race, progress, phase, rank, staminaRatio) {
    // Don't sprint if too tired
    if (staminaRatio < 0.25) {
      return { sprint: false, reason: "" };
    }
    
    // Get track conditions at current position
    const trackConditions = race.trackConditions || state.currentTrackConditions || { speedModifier: 1.0 };
    const trackAdaptability = racer.secondary?.trackAdaptability || 60;
    const isCleanTrack = trackConditions.speedModifier > 0.95 || trackAdaptability > 70;
    
    // Check if in straight section (better for sprinting!)
    const currentSection = getCurrentTrackSection(progress);
    const inStraight = currentSection && currentSection.type === 'straight';
    
    // Calculate gap to leader
    const leader = race.leaderboard[0];
    const gapToLeader = leader ? (leader.distance - racer.distance) : 0;
    const gapInUnits = Math.abs(gapToLeader);
    const isFallingBehind = gapInUnits > 50; // Increased from 30 - don't panic sprint too early!
    const isCloseRace = gapInUnits < 20;
    
    // Calculate gap to horse ahead
    const aheadHorses = race.racers.filter(r => !r.finished && r.distance > racer.distance);
    const closestAhead = aheadHorses.length > 0 ? 
      aheadHorses.reduce((prev, curr) => 
        Math.abs(curr.distance - racer.distance) < Math.abs(prev.distance - racer.distance) ? curr : prev
      ) : null;
    const gapAhead = closestAhead ? (closestAhead.distance - racer.distance) : 999;
    const canOvertake = gapAhead < 25 && gapAhead > 0;
    
    // Check if being challenged from behind
    const behindHorses = race.racers.filter(r => !r.finished && r.distance < racer.distance);
    const closestBehind = behindHorses.length > 0 ?
      behindHorses.reduce((prev, curr) =>
        Math.abs(curr.distance - racer.distance) < Math.abs(prev.distance - racer.distance) ? curr : prev
      ) : null;
    const gapBehind = closestBehind ? (racer.distance - closestBehind.distance) : 999;
    const beingChallenged = gapBehind < 20;
    
    // STRATEGY-BASED SPRINT DECISIONS
    const style = racer.style;
    const aggression = racer.aggressionRating || 60;
    
    // LEADER: Sprint to break away or defend position
    if (style === 'Leader') {
      if (rank === 1 && beingChallenged && staminaRatio > 0.5) {
        return { sprint: true, reason: "Defending lead from challenge!" };
      }
      if (rank === 1 && isCloseRace && phase === 'middle' && staminaRatio > 0.6 && isCleanTrack) {
        return { sprint: true, reason: "Breaking away on clean track!" };
      }
      if (rank === 2 && gapInUnits < 15 && staminaRatio > 0.55 && isCleanTrack) {
        return { sprint: true, reason: "Challenging for lead!" };
      }
    }
    
    // PACER: Sprint at key tactical moments (prefer straights!)
    if (style === 'Pacer') {
      if (canOvertake && staminaRatio > 0.5 && isCleanTrack && inStraight && phase === 'middle') {
        return { sprint: true, reason: "Tactical overtake on straight!" };
      }
      if (isFallingBehind && staminaRatio > 0.55 && phase === 'middle') {
        return { sprint: true, reason: "Closing gap to maintain pace!" };
      }
      if (phase === 'final' && rank > 2 && staminaRatio > 0.45 && canOvertake && inStraight) {
        return { sprint: true, reason: "Final straight positioning!" };
      }
    }
    
    // CHASER: Save stamina, sprint in final phase (wait for home straight!)
    if (style === 'Chaser') {
      if (phase === 'final' && staminaRatio > 0.5) {
        if (canOvertake && isCleanTrack && inStraight) {
          return { sprint: true, reason: "Home straight attack with saved stamina!" };
        }
        if (isFallingBehind && staminaRatio > 0.55 && inStraight) {
          return { sprint: true, reason: "Home straight sprint to close gap!" };
        }
      }
      // Early/middle: only sprint if desperately falling behind (prefer straights!)
      if (phase !== 'final' && isFallingBehind && gapInUnits > 50 && staminaRatio > 0.7 && inStraight) {
        return { sprint: true, reason: "Emergency sprint on straight!" };
      }
    }
    
    // SPRINTER: Multiple short bursts throughout (maximize straights!)
    if (style === 'Sprinter') {
      if (phase === 'start' && aggression > 65 && staminaRatio > 0.7 && inStraight) {
        return { sprint: true, reason: "Aggressive early burst on straight!" };
      }
      if (phase === 'middle' && canOvertake && staminaRatio > 0.55 && inStraight) {
        return { sprint: true, reason: "Mid-race overtake on straight!" };
      }
      if (phase === 'final' && (canOvertake || rank > 2) && staminaRatio > 0.4 && inStraight) {
        return { sprint: true, reason: "Home straight sprint!" };
      }
    }
    
    // UNIVERSAL: Sprint if desperately falling behind with good stamina
    if (isFallingBehind && gapInUnits > 80 && staminaRatio > 0.65 && phase !== 'start') {
      return { sprint: true, reason: "Desperate sprint to close major gap!" };
    }
    
    // TRACK CONDITIONS: Avoid sprinting in bad conditions unless desperate
    if (!isCleanTrack && trackConditions.speedModifier < 0.92 && !isFallingBehind) {
      return { sprint: false, reason: "" };
    }
    
    return { sprint: false, reason: "" };
  }

  function computeSlipstreamMultiplier(racer, race) {
    if (!racer.slipstreamBonus) return 1;
    let bonus = 1;
    let closestName = null;
    const threshold = 30;
    race.racers.forEach((other) => {
      if (other === racer || other.finished) return;
      const delta = (other.distance - racer.distance + TRACK_LENGTH) % TRACK_LENGTH;
      const zoneSeparation = Math.abs((other.zoneOffset || 0) - (racer.zoneOffset || 0));
      if (delta > 0 && delta < threshold && zoneSeparation <= 28) {
        const scaled = 1 + racer.slipstreamBonus * (1 - delta / threshold);
        if (scaled > bonus) {
          bonus = scaled;
          closestName = other.name;
        }
      }
    });
    // Log slipstream bonus
    if ((racer.isPlayer || Math.random() < 0.02) && bonus > 1.01 && closestName) {
      const bonusPct = ((bonus - 1) * 100).toFixed(1);
      console.log(`🌀 [Slipstream] ${racer.name} drafting behind ${closestName}! +${bonusPct}% speed`);
    }
    return bonus;
  }

  function runRaceLoop() {
    if (!state.race) return;

    const race = state.race;
    race.loopActive = true;
    race.accumulator = 0;
    let lastTime = performance.now();

    const step = (now) => {
      if (!state.race || !state.race.loopActive) return;

      const delta = Math.min(0.25, (now - lastTime) / 1000);
      lastTime = now;
      const currentRace = state.race;

      if (currentRace.countdownFlashTimer > 0) {
        currentRace.countdownFlashTimer = Math.max(0, currentRace.countdownFlashTimer - delta);
      }

      if (currentRace.countdownActive) {
        updateCountdown(currentRace, delta);
      } else if (currentRace.running) {
        currentRace.accumulator += delta;
        while (currentRace.accumulator >= TRACK_STEP) {
          updateRace(TRACK_STEP);
          currentRace.accumulator -= TRACK_STEP;
        }
      }

      drawRace(currentRace);

      if (currentRace.loopActive) {
        currentRace.animationId = requestAnimationFrame(step);
      }
    };

    race.animationId = requestAnimationFrame(step);
  }

  function updateCountdown(race, delta) {
    race.countdownTimer += delta;
    if (race.countdownTimer >= 1) {
      race.countdown -= 1;
      race.countdownTimer = 0;

      if (race.countdown > 0) {
        race.countdownLabel = String(race.countdown);
        playSfx("countdown");
      } else {
        race.countdownActive = false;
        race.running = true;
        race.countdownLabel = "Go!";
        race.countdownFlashTimer = 0.8;
        playSfx("go");
      }
    }
  }

  function logRaceRoster(race) {
    if (!console.table) {
      race.racers.forEach((racer) => {
        const zoneLabel = TRACK_ZONES[Math.max(0, Math.min(TRACK_ZONES.length - 1, racer.zoneIndex ?? DEFAULT_ZONE_INDEX))]?.display || "Mid Track";
        console.log(
          `${racer.name} | Style ${racer.style} | Zone ${zoneLabel} | Speed ${racer.performance.speed} | Handling ${racer.performance.handling} | Maneuver ${racer.performance.maneuver}`
        );
      });
      return;
    }

    const summary = race.racers.map((racer) => ({
      Name: racer.name,
      Style: racer.style,
      Zone: TRACK_ZONES[Math.max(0, Math.min(TRACK_ZONES.length - 1, racer.zoneIndex ?? DEFAULT_ZONE_INDEX))]?.display || "Mid Track",
      Speed: racer.performance.speed,
      Handling: racer.performance.handling,
      Maneuver: racer.performance.maneuver
    }));
    console.table(summary);
  }

  function updateRace(dt) {
    const race = state.race;
    if (!race || !race.running) return;

    race.time += dt;

    updateLeaderboard(race);
    decideZoneTargets(race, dt);

    const activeRacers = race.racers.filter((r) => !r.finished);
    const player = race.racers.find((r) => r.isPlayer);

    activeRacers.forEach((racer) => {
      stepRacer(racer, dt, race);
      if (racer.distance >= TRACK_LENGTH && !racer.finished) {
        racer.finished = true;
        racer.finishTime = race.time;
        const finalEnergy = Math.round((racer.energy / racer.maxEnergy) * 100);
        racer.energyHistory.push({ time: race.time, energy: finalEnergy });
        race.finishedOrder.push(racer);
      }
    });

    handlePassing(race, dt);

    updateLeaderboard(race);
    updateHud(player, race);

    if (race.finishedOrder.length === race.racers.length) {
      concludeRace();
    }
  }

  function stepRacer(racer, dt, race) {
    if (racer.skillToast) {
      racer.skillToast.timer -= dt;
      if (racer.skillToast.timer <= 0) {
        racer.skillToast = null;
      }
    }

    // Starting break delay - horse hasn't broken from gate yet
    if (!racer.hasStarted) {
      const raceStartTime = racer.startingBreakDelay || 0;
      if (race.time < raceStartTime) {
        racer.speed = 0;
        racer.distance = 0;
        return; // Don't move until break time
      } else {
        racer.hasStarted = true;
        if (racer.isPlayer) {
          console.log(`[Break] ${racer.name} broke from gate at ${race.time.toFixed(2)}s (delay: ${raceStartTime.toFixed(3)}s)`);
        }
      }
    }

    updateZoneState(racer, dt);

    const progress = (racer.distance % TRACK_LENGTH) / TRACK_LENGTH;
    const phase = progress < START_PHASE_LIMIT ? "start" : progress < FINAL_PHASE_START ? "middle" : "final";

    if (phase !== racer.phase) {
      racer.phase = phase;
      maybeTriggerSkills(racer, phase, race);
    }

    const baseSpeed = racer.baseSpeed;
    let styleMultiplier = getStylePhaseMultiplier(racer.style, phase);
    const staminaRatio = Math.max(0, Math.min(1, racer.energy / racer.maxEnergy));
    
    // Racing style strategic bonuses (for styleMultiplier)
    const rank = getRank(racer, race.leaderboard);
    
    // ============================================
    // DYNAMIC SPRINT SYSTEM
    // ============================================
    racer.sprintCooldown = Math.max(0, racer.sprintCooldown - dt);
    racer.sprintTimer = Math.max(0, racer.sprintTimer - dt);
    
    // End sprint if timer expires
    if (racer.sprintMode && racer.sprintTimer <= 0) {
      racer.sprintMode = false;
      const burstFreqRating = racer.secondary?.burstFrequency || 60;
      const cooldown = 5.5 - (burstFreqRating - 35) / 40; // 4.0s to 5.5s based on stat (MORE FREQUENT!)
      console.log(`💨 [Sprint End] ${racer.name} easing off (cooldown: ${cooldown.toFixed(1)}s)`);
      racer.sprintCooldown = cooldown;
    }
    
    // Decide if we should sprint (if not already sprinting)
    // NO SPRINT LIMIT! Constrained naturally by stamina and cooldown
    if (!racer.sprintMode && racer.sprintCooldown <= 0 && staminaRatio > 0.20) {
      const shouldSprint = decideSprint(racer, race, progress, phase, rank, staminaRatio);
      if (shouldSprint.sprint) {
        racer.sprintMode = true;
        racer.sprintTimer = 3.0 + (racer.stats.resolve / 100); // 3-4 second sprint
        racer.sprintsUsed++;
        const sprintPowerBoost = ((1.15 + ((racer.secondary?.sprintPower || 60) - 60) / 143) - 1) * 100;
        console.log(`🏃‍♂️ [Sprint #${racer.sprintsUsed}] ${racer.name} pushing hard! ${shouldSprint.reason}`);
        console.log(`   💨 Sprint Power: +${sprintPowerBoost.toFixed(1)}%, Duration: ${racer.sprintTimer.toFixed(1)}s, Stamina: ${(staminaRatio*100).toFixed(0)}%`);
      }
    }
    
    let sprintMultiplier = 1.0;
    let sprintDrainMultiplier = 1.0;
    if (racer.sprintMode) {
      // Sprint speed boost based on sprintPower stat (INCREASED RANGE!)
      const sprintPowerRating = racer.secondary?.sprintPower || 60;
      sprintMultiplier = 1.15 + (sprintPowerRating - 60) / 143; // 1.15 to 1.40 (15% to 40%!)
      
      // Sprint stamina cost based on sprintEfficiency stat (TIGHTER RANGE)
      const sprintEffRating = racer.secondary?.sprintEfficiency || 60;
      sprintDrainMultiplier = 2.8 - (sprintEffRating - 60) / 250; // 2.3x to 2.9x (tighter!)
      
      // Only log once when sprint starts
      if (!racer.sprintStatsLogged) {
        racer.sprintStatsLogged = true;
        if (racer.isPlayer) {
          console.log(`📊 [Sprint Stats] Power: ${sprintPowerRating} (+${((sprintMultiplier - 1) * 100).toFixed(1)}%), Efficiency: ${sprintEffRating} (${sprintDrainMultiplier.toFixed(2)}x drain)`);
        }
      }
    } else {
      racer.sprintStatsLogged = false; // Reset for next sprint
    }
    // ============================================
    
    // PACER: Optimal stamina management
    const pacerCondition = racer.style === 'Pacer' && staminaRatio > 0.4 && staminaRatio < 0.8;
    if (pacerCondition) {
      styleMultiplier *= 1.08; // +8% when managing well
      if (!racer.pacerStrategyActive) {
        racer.pacerStrategyActive = true;
        console.log(`⚖️ [Pacer Strategy] ${racer.name} in stamina sweet spot! +8% speed`);
      }
    } else {
      racer.pacerStrategyActive = false;
    }
    
    // CHASER: Burn stamina for final burst (will affect drain later)
    let styleDrainMultiplier = 1.0;
    const chaserCondition = racer.style === 'Chaser' && phase === 'final' && rank > 2;
    if (chaserCondition) {
      styleDrainMultiplier = 1.35; // Burn more stamina
      styleMultiplier *= 1.12; // Get extra speed!
      if (!racer.chaserStrategyActive) {
        racer.chaserStrategyActive = true;
        console.log(`⚡ [Chaser Strategy] ${racer.name} burning stamina for final push! +12% speed`);
      }
    } else {
      racer.chaserStrategyActive = false;
    }
    
    // SPRINTER: Buff early/middle phases + BIG final phase boost! (NERFED)
    if (racer.style === 'Sprinter') {
      if (phase === 'start') {
        styleMultiplier *= 1.03; // +3% in start phase (nerfed from +5%)
      } else if (phase === 'middle') {
        styleMultiplier *= 1.05; // +5% in middle phase (nerfed from +8%)
      } else if (phase === 'final') {
        if (!racer.sprinterFinalPhaseLogged) {
          racer.sprinterFinalPhaseLogged = true;
          console.log(`🏃 [Sprinter Surge] ${racer.name} activating final speed! +18%`);
        }
        styleMultiplier *= 1.18; // +18% speed in final phase! (nerfed from +22%)
        if (progress > 0.9) {
          if (!racer.sprinterExplosionLogged) {
            racer.sprinterExplosionLogged = true;
            console.log(`🚀 [Sprinter Explosion] ${racer.name} going ALL OUT! +30% speed!`);
          }
          styleMultiplier *= 1.10; // ANOTHER +10% in last 10%! (Total +30%!) (nerfed from +15%)
        }
      }
    }
    
    // CHASER: Buff middle phase so they don't fall too far behind!
    if (racer.style === 'Chaser' && phase === 'middle') {
      styleMultiplier *= 1.08; // +8% middle phase (was nothing!)
    }
    
    // LEADER: Save stamina when ahead (will affect drain later) - NERFED
    const leaderCondition = racer.style === 'Leader' && rank === 1 && progress < 0.6;
    if (leaderCondition) {
      styleDrainMultiplier = 0.80; // 20% less drain when leading early (nerfed from 35%)
      if (!racer.leaderStrategyActive) {
        racer.leaderStrategyActive = true;
        console.log(`🎯 [Leader Strategy] ${racer.name} in 1st, conserving stamina (-20% drain)`);
      }
    } else {
      racer.leaderStrategyActive = false;
    }
    
      const paceControl = racer.secondary?.paceControl ?? 60;
      const paceEfficiency = clamp(1 + (paceControl - 60) / 220 * (1 - staminaRatio), 0.85, 1.25);
      const energyFactor = Math.max(0.4, staminaRatio) * paceEfficiency;
    const skillMultiplier = resolveSkillMultiplier(racer, dt);
    const resolveBoost = phase === "final" && racer.stats.resolve > 40 ? 1 + (racer.stats.resolve - 40) * 0.005 : 1;
    const moodPercent = clamp(Math.round(racer.mood ?? 70), 0, 120);
    const moodMultiplier = 1 + (moodPercent - 70) * 0.0015;
    const jitterRange = (sampleRng(race) - 0.5) * 0.06 * (racer.jitterFactor || 1);
    const rngJitter = 1 + jitterRange + racer.rngModifier;
    const slipstreamMultiplier = computeSlipstreamMultiplier(racer, race);
      const phaseRating = racer.phasePowerProfile?.[phase];
      const phaseSynergy = phaseRating ? clamp(1 + (phaseRating - 60) / 260, 0.85, 1.3) : 1;
    
    // Track section mechanics (straights vs turns)
    let trackSectionMultiplier = 1.0;
    let overtakeMultiplier = 1.0;
    const currentSection = getCurrentTrackSection(progress);
    if (currentSection) {
      if (currentSection.type === 'straight') {
        // Straights: Speed matters, overtaking easier
        trackSectionMultiplier = currentSection.speedBonus;
        overtakeMultiplier = currentSection.overtakeBonus;
        if (racer.isPlayer && !racer.currentSectionLogged) {
          racer.currentSectionLogged = currentSection.name;
          console.log(`🏁 [${currentSection.name}] Speed +${((currentSection.speedBonus - 1) * 100).toFixed(0)}%, Overtaking +${((currentSection.overtakeBonus - 1) * 100).toFixed(0)}%`);
        }
      } else if (currentSection.type === 'turn') {
        // Turns: Handling matters, speed reduced
        const handlingRating = racer.performance?.handling || 50;
        const turnPenalty = currentSection.speedBonus; // 0.96
        const handlingBonus = 1 + (handlingRating - 50) / 400; // 0.975 to 1.125
        trackSectionMultiplier = turnPenalty * handlingBonus;
        overtakeMultiplier = 0.7; // Harder to overtake in turns!
        if (racer.isPlayer && racer.currentSectionLogged !== currentSection.name) {
          racer.currentSectionLogged = currentSection.name;
          console.log(`🔄 [${currentSection.name}] Speed ${((trackSectionMultiplier - 1) * 100).toFixed(1)}%, Overtaking harder`);
        }
      }
    }
    // Reset section log when leaving section
    if (currentSection && racer.currentSectionLogged && racer.currentSectionLogged !== currentSection.name) {
      racer.currentSectionLogged = null;
    }
    
    // Surface performance bonus/penalty
    let surfaceMultiplier = 1.0;
    const trackConditions = race.trackConditions || state.currentTrackConditions;
    if (trackConditions && racer.secondary?.surfacePerformance) {
      const surfPerf = racer.secondary.surfacePerformance;
      
      if (trackConditions.speedModifier >= 0.98) {
        // Clean/Dry track
        const dryRating = surfPerf.dry || 60;
        surfaceMultiplier = 1 + (dryRating - 60) / 400; // 0.9375 to 1.0625
        if (racer.isPlayer && !racer.surfacePerfLogged) {
          racer.surfacePerfLogged = true;
          console.log(`☀️ [Surface] ${racer.name} on dry track (rating: ${dryRating}) → ${((surfaceMultiplier - 1) * 100).toFixed(1)}% speed`);
        }
      } else if (trackConditions.weather === 'rainy') {
        // Wet/Rainy track
        const wetRating = surfPerf.wet || 60;
        const basePenalty = (1 - trackConditions.speedModifier);
        surfaceMultiplier = 1 - (basePenalty * (1 - (wetRating - 40) / 150));
        if (racer.isPlayer && !racer.surfacePerfLogged) {
          racer.surfacePerfLogged = true;
          console.log(`🌧️ [Surface] ${racer.name} on wet track (rating: ${wetRating}) → ${((surfaceMultiplier - 1) * 100).toFixed(1)}% speed`);
        }
      } else if (trackConditions.trackState === 'muddy') {
        // Muddy track
        const muddyRating = surfPerf.muddy || 60;
        const basePenalty = (1 - trackConditions.speedModifier);
        surfaceMultiplier = 1 - (basePenalty * (1 - (muddyRating - 40) / 120));
        if (racer.isPlayer && !racer.surfacePerfLogged) {
          racer.surfacePerfLogged = true;
          console.log(`💧 [Surface] ${racer.name} on muddy track (rating: ${muddyRating}) → ${((surfaceMultiplier - 1) * 100).toFixed(1)}% speed`);
        }
      }
    }

    let finalBurstMultiplier = 1;
    if (phase === "final") {
      if (!racer.finalBurst && racer.energy > FINAL_SPRINT_COST + 5) {
        spendStamina(racer, FINAL_SPRINT_COST, "final_sprint", race);
        racer.finalBurst = true;
        racer.finalBurstTimer = 2.5 + racer.stats.resolve / 140;
        const burstBonus = ((0.08 + racer.stats.resolve / 400) * 100).toFixed(0);
        console.log(`💨 [Final Sprint] ${racer.name} activated final burst! +${burstBonus}% speed for ${racer.finalBurstTimer.toFixed(1)}s`);
      }
      if (racer.finalBurstTimer > 0) {
        finalBurstMultiplier += 0.08 + racer.stats.resolve / 400;
        racer.finalBurstTimer -= dt;
      }
    }

    let targetSpeed =
      baseSpeed *
      styleMultiplier *
      sprintMultiplier * // SPRINT BOOST!
      trackSectionMultiplier * // TRACK SECTION (straights vs turns)!
      surfaceMultiplier * // SURFACE PERFORMANCE!
      energyFactor *
      skillMultiplier *
      resolveBoost *
      moodMultiplier *
      slipstreamMultiplier *
        finalBurstMultiplier *
        phaseSynergy *
      rngJitter;

    if (racer.energy <= 0) {
      targetSpeed *= 0.80;
      if (!racer.depleted) {
        racer.depleted = true;
        console.log(`💔 [Exhausted] ${racer.name} out of stamina! Speed reduced to 58%`);
      }
    }

    const currentSpeed = racer.speed || 0;
    const speedDelta = targetSpeed - currentSpeed;
    let updatedSpeed = currentSpeed;
    if (speedDelta > 0) {
      updatedSpeed = currentSpeed + Math.min(speedDelta, racer.acceleration * dt);
    } else {
      updatedSpeed = currentSpeed + Math.max(speedDelta, -racer.acceleration * 0.7 * dt);
    }
    const handlingCap = racer.maxSpeed * (racer.handlingPenaltyActive || racer.handlingPenaltyBase || 1);
    updatedSpeed = Math.min(updatedSpeed, handlingCap);
    if (!Number.isFinite(updatedSpeed) || updatedSpeed < 0) {
      updatedSpeed = Math.max(0, targetSpeed);
    }

    if (racer.energy < racer.fatigueThreshold) {
      const fatigueRatio = Math.max(0, Math.min(1, racer.energy / racer.fatigueThreshold));
      let fatiguePenalty = lerp(0.72, 1, fatigueRatio);
        fatiguePenalty += Math.max(0, (racer.stats.resolve - 60) / 320);
        const fatigueResist = racer.secondary?.fatigueResistance ?? 60;
        fatiguePenalty *= clamp(1 / (1 + (fatigueResist - 60) / 220), 0.82, 1.05);
      fatiguePenalty = Math.min(fatiguePenalty, 1);
      updatedSpeed *= fatiguePenalty;
    }

    racer.speed = updatedSpeed;
    racer.distance += (updatedSpeed * dt) / (racer.distanceMultiplier || 1);

    const intensity = Math.max(0.4, Math.min(1.3, updatedSpeed / Math.max(1, racer.baseSpeed)));
    const shieldFactor = racer.staminaShieldActive ?? racer.staminaShieldBase ?? 1;
    const focusDrainFactor = racer.focusDrainFactorActive ?? racer.focusDrainFactorBase ?? 1;
      const paceDrainFactor = clamp(1 - (paceControl - 60) / 260, 0.72, 1.1);
      let maintainCost =
        racer.baseDrain *
        intensity *
        (racer.energyDrainFactor || 1) *
        focusDrainFactor *
        shieldFactor *
        paceDrainFactor *
        styleDrainMultiplier * // Racing style affects drain!
        sprintDrainMultiplier * // SPRINT DRAIN!
        dt;
    spendStamina(racer, maintainCost, "maintain", race);

    const timeSincePass = race.time - (racer.lastPassAttempt || 0);
    if (!racer.isBlocked && timeSincePass > 2.2 && racer.energy < racer.maxEnergy) {
      // Enhanced recovery based on staminaRecovery stat
      const recoveryRating = racer.secondary?.staminaRecovery || 60;
      const baseRecovery = 0.05 + (recoveryRating - 35) / 250; // 0.07 to 0.29
      const regen = (baseRecovery + (racer.coolRecoveryRate || 0)) * dt;
      recoverStamina(racer, regen);
      
      // Random stamina boost for high recovery rating
      if (recoveryRating > 75 && Math.random() < 0.002) {
        const boost = 3 + (recoveryRating - 75) / 5; // 3-7 stamina
        recoverStamina(racer, boost);
        if (racer.isPlayer || Math.random() < 0.3) {
          console.log(`💚 [Recovery Boost] ${racer.name} caught breath! +${boost.toFixed(1)} stamina`);
        }
      }
    }

    if (racer.coolRecoveryRate && updatedSpeed < racer.baseSpeed * 0.65) {
      const recovery = racer.maxEnergy * racer.coolRecoveryRate * dt;
      recoverStamina(racer, recovery);
    }

    racer.energySampleTimer += dt;
    if (racer.energySampleTimer >= 1) {
      racer.energySampleTimer = 0;
      const energyPercent = Math.round((racer.energy / racer.maxEnergy) * 100);
      racer.energyHistory.push({ time: race.time, energy: energyPercent });
    }
  }

  function maybeTriggerSkills(racer, phase, race) {
      if (racer.simpleSkillMode) {
        return;
      }
    racer.skills.forEach((skill) => {
      if (skill.type && skill.type !== "active") return;
      if (!skill.trigger) return;
      if (skill.used || skill.active || skill.trigger !== phase) return;

        const procRating = racer.skillProcRating ?? racer.secondary?.skillProc ?? racer.profile?.secondary?.skillProc ?? 55;
        const legendaryLuck = racer.modifiers?.legendaryLuck || 0;
        const staminaRatio = racer.energy / racer.maxEnergy;
        
        let chance = 0.28 + racer.stats.insight * 0.002;
      chance += racer.modifiers?.skillChanceBonus || 0;
        chance += legendaryLuck * 0.45;
        chance += (procRating - 60) / 140;
        
      // Mood affects skill activation MORE
      const moodPercent = clamp(Math.round(racer.mood ?? 70), 0, 100);
      const moodBonus = (moodPercent - 70) / 120; // Stronger effect!
      chance += moodBonus;
      
      // Stamina affects skill activation - need energy to use skills!
      const staminaBonus = staminaRatio > 0.6 ? 0.12 : staminaRatio > 0.4 ? 0.05 : -0.15;
      chance += staminaBonus;

      if (!racer.isPlayer) {
        if (racer.style === "Leader" && phase === "start") {
          chance += 0.1;
        } else if (racer.style === "Chaser" && phase === "final") {
          chance += 0.2;
        } else if (racer.style === "Sprinter" && phase === "final") {
          chance += 0.15;
        }
        const baseline = 0.45 + (racer.insightBonusActive || 0);
        chance = Math.max(chance, baseline);
        } else {
          chance = Math.max(chance, 0.35);
        }

        chance = clamp(chance, racer.isPlayer ? 0.35 : 0.55, 0.96);

      // 🔍 DEBUG: Log skill activation attempt (ALWAYS for player, only success for AI)
      const roll = sampleRng(race);
      if (racer.isPlayer) {
        console.log(`🎲 [SKILL CHECK] ${racer.name} - ${skill.name} (${phase}): Chance=${(chance*100).toFixed(1)}%, Roll=${(roll*100).toFixed(1)}% ${roll < chance ? '✅ SUCCESS!' : '❌ Failed'}`);
        console.log(`   Insight=${racer.stats.insight}, ProcRating=${procRating}, Mood=${moodPercent}%, Stamina=${(staminaRatio*100).toFixed(0)}%`);
      } else if (roll < chance) {
        console.log(`🎲 [SKILL CHECK] ${racer.name} - ${skill.name} (${phase}): ✅ SUCCESS! Chance=${(chance*100).toFixed(1)}%`);
      }
      
      if (roll < chance) {
        skill.active = true;
        // LONGER DURATION: 2.0x for major impact!
        skill.timer = (skill.duration || 4) * 2.0;
        skill.used = true;
        racer.skillToast = { name: skill.name, timer: 3.0 }; // Show longer!
        racer.skillLog.push({ name: skill.name, time: race.time, phase });
        console.log(`%c⚡⚡ SKILL ACTIVATED ⚡⚡%c ${racer.name} used ${skill.name} (+${Math.round(skill.boost * 250)}% speed for ${skill.timer.toFixed(1)}s)`, "color:#ffd700; font-weight:bold; font-size:1.2em; background:#331a00; padding:4px;", "color:#d0d3e8");
      }
    });
  }

  function resolveSkillMultiplier(racer, dt) {
    let multiplier = 1;
    let handlingPenalty = racer.handlingPenaltyBase || 1;
    let staminaShield = racer.staminaShieldBase ?? 1;
    let focusDrain = racer.focusDrainFactorBase ?? 1;
    let insightBonus = racer.insightBonusBase ?? 0;
    let zoneDecisionFactor = racer.zoneDecisionFactorBase ?? 1;
    let zoneBias = racer.zoneBiasPassive ?? null;
    let zoneBiasPhase = racer.zoneBiasPhase ?? null;
    const skills = racer.skills || [];
    skills.forEach((skill) => {
      if (!skill.active) return;
      skill.timer -= dt;
      if (skill.timer > 0) {
        const effect = skill.effect || {};
        if (typeof skill.boost === "number") {
          // POWERFUL: Skills are 2.5x stronger - can create comebacks!
          const enhancedBoost = skill.boost * 2.5;
          multiplier *= 1 + enhancedBoost;
        }
        if (skill.riskPenalty) {
          handlingPenalty *= 0.85;
        }
        if (effect.staminaShield) {
          staminaShield = Math.min(staminaShield, effect.staminaShield);
        }
        if (effect.focusDrain) {
          focusDrain *= effect.focusDrain;
        }
        if (effect.insightBonus) {
          insightBonus += effect.insightBonus;
        }
        if (effect.zoneDecisionFactor) {
          zoneDecisionFactor *= effect.zoneDecisionFactor;
        }
        if (effect.zoneBias) {
          zoneBias = effect.zoneBias;
          zoneBiasPhase = effect.zonePhase || skill.trigger || racer.phase;
        }
        if (effect.staminaRegen) {
          recoverStamina(racer, racer.maxEnergy * effect.staminaRegen * dt);
        }
      } else {
        skill.active = false;
      }
    });
    racer.handlingPenaltyActive = handlingPenalty;
    racer.staminaShieldActive = Math.max(0.4, Math.min(staminaShield, 1));
    racer.focusDrainFactorActive = Math.max(0.5, Math.min(focusDrain, 1.2));
    racer.insightBonusActive = clamp(insightBonus, 0, 0.25);
    racer.zoneDecisionFactorActive = Math.max(0.5, Math.min(zoneDecisionFactor, 1.3));
    racer.zoneBiasActive = zoneBias;
    racer.zoneBiasActivePhase = zoneBiasPhase;
    return multiplier;
  }

  function updateLeaderboard(race) {
    race.leaderboard = [...race.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
  }

  function updateHud(player, race) {
    if (!player) return;

    const phaseLabel = capitalize(player.phase);
    elements.hudPhase.textContent = `${phaseLabel} · ${player.style}`;
    elements.hudTimer.textContent = race.time.toFixed(1);

    const rank = race.leaderboard.findIndex((r) => r.id === player.id) + 1;
    elements.hudRank.textContent = rank ? `#${rank}` : "--";

    const energyPct = clamp(Math.round((player.energy / player.maxEnergy) * 100), 0, 100);
    elements.hudEnergy.style.width = `${energyPct}%`;

    elements.hudSkills.innerHTML = "";
    player.skills.forEach((skill) => {
      const pill = document.createElement("div");
      pill.className = `skill-pill ${skill.active ? "active" : ""}`.trim();
      pill.textContent = skill.name;
      elements.hudSkills.appendChild(pill);
    });

    if (race && race.debugPhase !== player.phase) {
      console.log(`[Phase] Player now in ${phaseLabel.toUpperCase()} phase (${player.style})`);
      race.debugPhase = player.phase;
    }
  }

  function concludeRace() {
    if (!state.race) return;
    const race = state.race;
    race.running = false;
    race.loopActive = false;
    playSfx("finish");
    if (race.animationId) {
      cancelAnimationFrame(race.animationId);
      race.animationId = null;
    }
    elements.startRace.disabled = false;
    
    // 🔍 LOG ALL RACER STATS AT RACE END
    console.log('\n='.repeat(60));
    console.log('📊 FINAL RACE STATS (ALL RACERS)');
    console.log('='.repeat(60));
    race.finishedOrder.forEach((racer, index) => {
      const finalStamina = Math.round((racer.energy / racer.maxEnergy) * 100);
      console.log(`\n${index + 1}. ${racer.name} (${racer.style}) - ${racer.finishTime.toFixed(1)}s`);
      console.log(`   Base Speed: ${racer.baseSpeed.toFixed(3)}, Max Speed: ${racer.maxSpeed.toFixed(3)}`);
      console.log(`   Stats: Stride=${racer.stats.stride}, End=${racer.stats.endurance}, Force=${racer.stats.force}`);
      console.log(`   Final Stamina: ${finalStamina}%, Sprints Used: ${racer.sprintsUsed || 0}`);
    });
    console.log('='.repeat(60) + '\n');
    showResults(race);
  }

  function stopRace() {
    if (!state.race) return;
    const race = state.race;
    race.running = false;
    race.loopActive = false;
    race.countdownActive = false;
    if (race.animationId) {
      cancelAnimationFrame(race.animationId);
      race.animationId = null;
    }
    elements.startRace.disabled = false;
    drawRaceIdle();
    state.race = null;
  }

  function showResults(race) {
    const ordered = [...race.leaderboard];
    elements.resultsBody.innerHTML = "";

    ordered.forEach((racer, index) => {
      const div = document.createElement("div");
      div.className = `result-entry ${racer.isPlayer ? "player" : ""}`.trim();
      const timeLabel = racer.finishTime ? `${racer.finishTime.toFixed(2)}s` : "DNF";
      const skillNames = racer.skillLog.length
        ? racer.skillLog.map((s) => s.name).join(", ")
        : "None";

      const roleLabel = racer.isPlayer ? "Player" : "AI";
      const styleName = racer.style || racer.styleName || "--";
      const finalStamina = Math.round((racer.energy / racer.maxEnergy) * 100);
      const baseSpeedDisplay = racer.baseSpeed ? racer.baseSpeed.toFixed(3) : "N/A";
      div.innerHTML = `
        <div>
          <strong>${index + 1}. ${racer.name}</strong><br/>
          <small>${roleLabel} • ${styleName}</small><br/>
          <small style="color: #888;">Base Speed: ${baseSpeedDisplay} | Stride: ${racer.stats?.stride || "?"} | End: ${racer.stats?.endurance || "?"}</small><br/>
          <small style="color: #888;">Sprints: ${racer.sprintsUsed || 0} | Final Stamina: ${finalStamina}%</small>
        </div>
        <div>
          <div>${timeLabel}</div>
          <div class="skills-used">Skills: ${skillNames}</div>
        </div>
      `;

      const energySamples = (racer.energyHistory || []).filter(
        (_, idx) => idx % 2 === 0 || idx === (racer.energyHistory || []).length - 1
      );
      const energyTimeline = energySamples.slice(Math.max(energySamples.length - 12, 0));
      const energyList = energyTimeline
        .map((point) => `<li>${point.time.toFixed(1)}s · ${point.energy}%</li>`)
        .join("");

      const skillLogList = racer.skillLog.length
        ? racer.skillLog
            .map((event) => {
              const phaseLabel = event.phase ? ` (${capitalize(event.phase)})` : "";
              return `<li>${event.time.toFixed(1)}s · ${event.name}${phaseLabel}</li>`;
            })
            .join("")
        : "<li>No skills triggered</li>";

      const details = document.createElement("details");
      details.innerHTML = `
        <summary>Race log</summary>
        <div>
          <strong>Stamina</strong>
          <ul>${energyList || "<li>No data</li>"}</ul>
          <strong>Skills</strong>
          <ul>${skillLogList}</ul>
        </div>
      `;

      div.appendChild(details);
      elements.resultsBody.appendChild(div);
    });

    elements.resultsReplay.disabled = !state.lastRaceConfig;
    elements.resultsModal.hidden = false;
  }

  function hideResults() {
    elements.resultsModal.hidden = true;
  }

  function drawRace(race) {
    if (!race) return;
    const width = canvas.width / deviceRatio;
    const height = canvas.height / deviceRatio;
    ctx.save();
    ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    drawTrack(width, height);

    race.racers.forEach((racer) => {
      drawRacer(racer, width, height);
    });

    drawLeaderboardOverlay(race, width, height);

    if (race.countdownActive || (race.countdownFlashTimer && race.countdownFlashTimer > 0)) {
      ctx.save();
      const label = race.countdownLabel || `${Math.max(1, Math.ceil(race.countdown || 1))}`;
      const alpha = race.countdownActive ? 0.88 : clamp(race.countdownFlashTimer / 0.8, 0, 1);
      ctx.globalAlpha = alpha;
      const overlaySize = 180;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(width / 2 - overlaySize / 2, height / 2 - overlaySize / 2, overlaySize, overlaySize);
      ctx.fillStyle = "#ffffff";
      ctx.font = label === "Go!" ? "72px sans-serif" : "88px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, width / 2, height / 2 + 24);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawRaceIdle() {
    if (!ctx) return;
    const width = canvas.width / deviceRatio;
    const height = canvas.height / deviceRatio;
    ctx.save();
    ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawTrack(width, height);
    ctx.restore();
  }

  function drawTrack(width, height) {
    ctx.fillStyle = "#184d2d";
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const aOuter = width * 0.42;
    const bOuter = height * 0.36;
    const aInner = width * 0.32;
    const bInner = height * 0.26;

    ctx.fillStyle = "#3c3f46";
    ctx.beginPath();
    ctx.ellipse(cx, cy, aOuter, bOuter, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#184d2d";
    ctx.beginPath();
    ctx.ellipse(cx, cy, aInner, bInner, 0, 0, Math.PI * 2);
    ctx.fill();

    // Finish line
    ctx.save();
    ctx.translate(cx, cy - bInner);
    ctx.rotate(Math.PI / 180 * 90);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(-20, -3, 40, 6);
    ctx.restore();
  }

  // Cache for racer images to avoid reloading
  const racerImageCache = new Map();

  function drawRacer(racer, width, height) {
    const pos = positionFromDistance(racer.distance, width, height, racer.zoneOffset || 0);
    const avatarSize = 32;
    const avatarX = pos.x - avatarSize / 2;
    const avatarY = pos.y - avatarSize / 2;

    // Draw avatar image if available
    if (racer.portrait || racer.image) {
      const imgSrc = racer.portrait || racer.image;
      
      if (!racerImageCache.has(imgSrc)) {
        const img = new Image();
        img.src = imgSrc;
        racerImageCache.set(imgSrc, img);
      }
      
      const img = racerImageCache.get(imgSrc);
      if (img.complete && img.naturalHeight !== 0) {
        // Draw circular clipped image
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        
        // Draw border around avatar
        ctx.strokeStyle = racer.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, avatarSize / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Fallback to colored circle while image loads
        ctx.fillStyle = racer.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // No image - use colored circle
      ctx.fillStyle = racer.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ENHANCED: Skill glow effect - MORE VISIBLE!
    const activeSkill = racer.skills?.find(s => s.active);
    if (activeSkill) {
      // Pulsing glow animation
      const pulseIntensity = 0.6 + Math.sin(Date.now() / 100) * 0.4;
      
      // Outer glow ring
      ctx.save();
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulseIntensity})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (avatarSize / 2) + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      
      // Inner highlight
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (avatarSize / 2) + 2, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw skill name above horse in GOLD
      ctx.save();
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#ffd700";
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.lineWidth = 3;
      ctx.textAlign = "center";
      ctx.strokeText(`⚡ ${activeSkill.name}`, pos.x, pos.y - avatarSize / 2 - 25);
      ctx.fillText(`⚡ ${activeSkill.name}`, pos.x, pos.y - avatarSize / 2 - 25);
      ctx.restore();
    }

    // Draw skill toast notification
    if (racer.skillToast) {
      const alpha = clamp(racer.skillToast.timer / 1.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(12, 16, 24, 0.85)";
      const toastWidth = 110;
      const toastHeight = 20;
      const toastX = pos.x - toastWidth / 2;
      const toastY = avatarY - 30;
      ctx.fillRect(toastX, toastY, toastWidth, toastHeight);
      ctx.strokeStyle = "rgba(90, 200, 250, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(toastX, toastY, toastWidth, toastHeight);
      ctx.fillStyle = "#5ac8fa";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(racer.skillToast.name, pos.x, toastY + 14);
      ctx.restore();
    }

    // Draw racer name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(racer.name, pos.x, avatarY - 8);
    ctx.fillText(racer.name, pos.x, avatarY - 8);
  }

  function drawLeaderboardOverlay(race, width, height) {
    const panelWidth = 180;
    const panelHeight = 120;
    const x = width - panelWidth - 16;
    const y = height - panelHeight - 16;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, panelWidth, panelHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Leaderboard", x + 12, y + 18);

    race.leaderboard.slice(0, 4).forEach((racer, index) => {
      const lineY = y + 38 + index * 20;
      const styleTag = racer.style ? racer.style.charAt(0) : "-";
      const prefix = `${index + 1}. ${racer.name} [${styleTag}]`;
      const zoneInfo = TRACK_ZONES[Math.max(0, Math.min(TRACK_ZONES.length - 1, racer.zoneIndex ?? 1))];
      const zoneLabel = zoneInfo ? zoneInfo.display : "Mid Track";
      const suffix = racer.finished
        ? `${racer.finishTime.toFixed(1)}s`
        : `${Math.min(100, Math.round((racer.distance / TRACK_LENGTH) * 100))}% · ${zoneLabel}`;
      ctx.fillStyle = racer.isPlayer ? "#5ac8fa" : "#dddddd";
      ctx.fillText(prefix, x + 12, lineY);
      ctx.textAlign = "right";
      ctx.fillText(suffix, x + panelWidth - 12, lineY);
      ctx.textAlign = "left";
    });
  }

  function positionFromDistance(distance, width, height, offset = 0) {
    const progress = (distance % TRACK_LENGTH) / TRACK_LENGTH;
    const theta = -Math.PI / 2 + progress * Math.PI * 2;
    const cx = width / 2;
    const cy = height / 2;
    const a = width * 0.37;
    const b = height * 0.32;

    const baseX = cx + Math.cos(theta) * a;
    const baseY = cy + Math.sin(theta) * b;

    if (!offset) {
      return { x: baseX, y: baseY };
    }

    const normalX = Math.cos(theta) / a;
    const normalY = Math.sin(theta) / b;
    const normalLength = Math.hypot(normalX, normalY) || 1;
    const offsetX = (normalX / normalLength) * offset;
    const offsetY = (normalY / normalLength) * offset;

    return {
      x: baseX + offsetX,
      y: baseY + offsetY
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  function sampleRng(race) {
    return race && typeof race.rng === "function" ? race.rng() : Math.random();
  }

  function randomBetween(race, min, max) {
    return min + (max - min) * sampleRng(race);
  }

    function sampleRandom(source) {
      if (typeof source === "function") {
        return Math.min(Math.max(source(), 0), 1);
      }
      if (source) {
        return sampleRng(source);
      }
      return Math.random();
    }

    function randomVariance(min, max, source) {
      if (min > max) {
        return randomVariance(max, min, source);
      }
      const rand = sampleRandom(source);
      return min + (max - min) * rand;
    }

    function computeRacePerformanceScore(racer, source) {
      const stats = racer.stats || {};
      const stride = Math.pow(clamp(stats.stride || 0, 0, 100), 1.2);
      const endurance = Math.pow(clamp(stats.endurance || 0, 0, 100), 1.2);
      const force = Math.pow(clamp(stats.force || 0, 0, 100), 1.2);
      const resolve = Math.pow(clamp(stats.resolve || 0, 0, 100), 1.2);
      const insight = Math.pow(clamp(stats.insight || 0, 0, 100), 1.2);

      let score =
        stride * 0.25 +
        endurance * 0.25 +
        force * 0.15 +
        resolve * 0.15 +
        insight * 0.2;

      score += randomVariance(-20, 20, source);

      const skillTriggerChance = clamp(0.2 + (clamp(stats.insight || 0, 0, 100) / 500), 0.2, 0.4);
      const roll = sampleRandom(source);
      let skillTriggered = false;
      let skillBoost = 0;
      if (roll < skillTriggerChance) {
        skillBoost = 25 + randomVariance(-5, 5, source);
        score += skillBoost;
        skillTriggered = true;
      }

      return {
        score,
        skillTriggered,
        skillBoost,
        skillTriggerChance
      };
    }

    function applyRacePerformanceAdjustments(racer, rngSource) {
      if (!racer || !racer.stats) return;
      const result = computeRacePerformanceScore(racer, rngSource);
      racer.performanceScore = result.score;
      racer.skillTriggerChance = result.skillTriggerChance;
      racer.skillTriggered = result.skillTriggered;
      racer.skillBoostApplied = result.skillBoost;
      racer.simpleSkillMode = true;

      const baseline = 160;
      const diff = result.score - baseline;
      const speedMultiplier = clamp(1 + diff / 260, 0.65, 1.45);
      const accelMultiplier = clamp(1 + diff / 350, 0.7, 1.35);

      racer.baseSpeed *= speedMultiplier;
      racer.maxSpeed *= speedMultiplier;
      racer.acceleration *= accelMultiplier;
      racer.rngModifier = clamp(diff / 600, -0.25, 0.25);

      if (!Array.isArray(racer.skillLog)) {
        racer.skillLog = [];
      }

      if (racer.skillTriggered) {
        const label = "Decisive Burst";
        racer.skillLog.push({ name: label, time: 0, phase: "boost" });
        racer.skillToast = { name: label, timer: 1.5 };
      } else {
        racer.skillToast = null;
      }
    }

  function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function generateTokenId() {
    return `AVT-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  function createSfx() {
    if (typeof window === "undefined") return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    let ctx = null;
    const lastPlayed = new Map();
    const minInterval = 0.04;

    const ensureContext = () => {
      if (!ctx) {
        ctx = new AudioCtor();
      }
      return ctx;
    };

    const triggerTone = (context, tone) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = tone.type || "sine";
      oscillator.frequency.value = tone.freq;
      const start = context.currentTime + (tone.delay || 0);
      const duration = Math.max(0.05, tone.duration || 0.18);
      const peak = Math.max(0.001, tone.gain || 0.2);

      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(peak, start + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);
    };

    const patterns = {
      train: [{ freq: 880, duration: 0.12, gain: 0.25 }],
      countdown: [{ freq: 520, duration: 0.2, gain: 0.22 }],
      go: [
        { freq: 760, duration: 0.16, gain: 0.24 },
        { freq: 1020, duration: 0.12, gain: 0.2, delay: 0.08 }
      ],
      finish: [
        { freq: 660, duration: 0.22, gain: 0.23 },
        { freq: 880, duration: 0.18, gain: 0.2, delay: 0.18 }
      ]
    };

    const play = (name) => {
      const pattern = patterns[name];
      if (!pattern) return;
      const context = ensureContext();
      if (!context) return;

      const schedulePattern = () => {
        const now = context.currentTime;
        const last = lastPlayed.get(name) || 0;
        if (now - last < minInterval) {
          return;
        }
        lastPlayed.set(name, now);
        pattern.forEach((tone) => triggerTone(context, tone));
      };

      if (context.state === "suspended") {
        context
          .resume()
          .then(schedulePattern)
          .catch(() => {});
      } else {
        schedulePattern();
      }
    };

    window.addEventListener(
      "pointerdown",
      () => {
        const context = ensureContext();
        if (context && context.state === "suspended") {
          context.resume().catch(() => {});
        }
      },
      { once: true }
    );

    return { play };
  }
  // Expose race simulation functions for multiplayer
  window.RaceSimulation = {
    buildRacer,
    updateRace,
    stepRacer,
    applyRacePerformanceAdjustments,
    assignInitialLanes,
    TRACK_LENGTH,
    TRACK_STEP,
    START_PHASE_LIMIT,
    FINAL_PHASE_START
  };

  })();
