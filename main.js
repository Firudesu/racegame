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
    deriveAptitudes
  } = Data;

  const elements = {
    tokenId: document.getElementById("token-id"),
    horseName: document.getElementById("horse-name"),
    sessions: document.getElementById("horse-sessions"),
    horseStyle: document.getElementById("horse-style"),
    legacyFlag: document.getElementById("legacy-flag"),
    skillList: document.getElementById("skill-list"),
    trainingLog: document.getElementById("training-log"),
    hudPhase: document.getElementById("hud-phase"),
    hudTimer: document.getElementById("hud-timer"),
    hudRank: document.getElementById("hud-rank"),
    hudEnergy: document.getElementById("hud-energy"),
    hudSkills: document.getElementById("hud-skills"),
    mapMenu: document.getElementById("map-menu"),
    trainingScreen: document.getElementById("training-screen"),
    paddockScreen: document.getElementById("paddock-screen"),
    raceSelectionScreen: document.getElementById("race-selection-screen"),
    raceScreen: document.getElementById("race-screen"),
    retiredScreen: document.getElementById("retired-screen"),
    trainingOptions: document.getElementById("training-options"),
    paddockSlots: document.getElementById("paddock-slots"),
    horseSelectionList: document.getElementById("horse-selection-list"),
    retiredList: document.getElementById("retired-list"),
    backToMap: document.getElementById("back-to-map"),
    paddockBack: document.getElementById("paddock-back"),
    raceSelectionBack: document.getElementById("race-selection-back"),
    raceBack: document.getElementById("race-back"),
    retiredBack: document.getElementById("retired-back"),
    startRace: document.getElementById("start-race"),
    resultsModal: document.getElementById("results-modal"),
    resultsBody: document.getElementById("results-body"),
    resultsBack: document.getElementById("results-back"),
    resultsReplay: document.getElementById("results-replay"),
    raceCanvas: document.getElementById("race-canvas"),
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

  const canvas = elements.raceCanvas;
  const ctx = canvas.getContext("2d");
  let deviceRatio = window.devicePixelRatio || 1;
  let eventsBound = false;
  resizeCanvas();

  const state = {
    paddockHorses: [],
    mainHorseId: null,
    selectedHorse: null,
    tokenId: null,
    legacyRecords: [],
    trainingLog: [],
    currentScreen: "map",
    race: null,
    lastRaceConfig: null,
    trainingInProgress: false
  };

  const Sfx = createSfx();

  function playSfx(name) {
    if (!Sfx) return;
    Sfx.play(name);
  }

  const TRAINING_BASE_GAIN = 8;
  const TRACK_STEP = 1 / 20;

  const TRACK_ZONES = [
    { key: "inside", display: "Inside Track", radiusOffset: -24, distanceMultiplier: 0.98 },
    { key: "mid", display: "Mid Track", radiusOffset: 0, distanceMultiplier: 1 },
    { key: "outside", display: "Outside Track", radiusOffset: 24, distanceMultiplier: 1.03 }
  ];

  const ZONE_COUNT = TRACK_ZONES.length;
  const LANE_COUNT = ZONE_COUNT;
  const DEFAULT_ZONE_INDEX = Math.floor(ZONE_COUNT / 2);
  const ZONE_CHANGE_RATE = 2.6;
  const PASS_DISTANCE_THRESHOLD = 24;
  const PASS_COOLDOWN_MIN = 2.0;
  const PASS_COOLDOWN_MAX = 4.0;
  const PASS_COST_SUCCESS = { min: 6, max: 10 };
  const PASS_COST_FAIL = { min: 4, max: 8 };
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

  init();

  function init() {
    state.legacyRecords = Storage.loadLegacyRecords();
    state.paddockHorses = Storage.loadPaddockHorses();
    state.mainHorseId = Storage.loadMainHorseId();
    state.tokenId = Storage.loadTokenId();

    // Migrate old avatar to paddock system
    const oldAvatar = Storage.loadCurrentAvatar();
    if (oldAvatar && state.paddockHorses.length === 0) {
      oldAvatar.id = `horse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      ensureHorseSchema(oldAvatar);
      Storage.addHorseToPaddock(oldAvatar);
      Storage.saveMainHorseId(oldAvatar.id);
      state.paddockHorses = [oldAvatar];
      state.mainHorseId = oldAvatar.id;
    }

    // Set selected horse to main horse or first available
    if (state.mainHorseId) {
      state.selectedHorse = state.paddockHorses.find(h => h.id === state.mainHorseId);
    }
    if (!state.selectedHorse && state.paddockHorses.length > 0) {
      state.selectedHorse = state.paddockHorses[0];
      state.mainHorseId = state.selectedHorse.id;
      Storage.saveMainHorseId(state.mainHorseId);
    }

    if (!state.tokenId) {
      state.tokenId = generateTokenId();
      Storage.saveTokenId(state.tokenId);
    }

    bindEvents();
    refreshUI();
    showScreen("map");
    drawRaceIdle();
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    // Map menu buttons
    document.querySelectorAll('[data-location]').forEach(button => {
      button.addEventListener("click", () => {
        const location = button.dataset.location;
        handleLocationClick(location);
      });
    });

    // Back buttons
    elements.backToMap?.addEventListener("click", () => showScreen("map"));
    elements.paddockBack?.addEventListener("click", () => showScreen("map"));
    elements.raceSelectionBack?.addEventListener("click", () => showScreen("map"));
    elements.retiredBack?.addEventListener("click", () => showScreen("map"));
    
    elements.raceBack?.addEventListener("click", () => {
      stopRace();
      showScreen("race-selection");
    });

    // Race buttons
    elements.startRace?.addEventListener("click", () => startRace(false));
    
    // Results modal
    elements.resultsBack?.addEventListener("click", () => {
      hideResults();
      showScreen("race-selection");
    });

    elements.resultsReplay?.addEventListener("click", () => {
      hideResults();
      if (state.lastRaceConfig) {
        showScreen("race");
        startRace(true);
      }
    });

    // Reset button
    elements.resetButton?.addEventListener("click", handleReset);

    window.addEventListener("resize", resizeCanvas);
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
    elements.tokenId.textContent = state.tokenId;
    
    if (state.selectedHorse) {
      updateHorseProfile(state.selectedHorse);
      elements.horseName.textContent = state.selectedHorse.name;
      elements.sessions.textContent = state.selectedHorse.sessions;
      elements.horseStyle.textContent = state.selectedHorse.style || "Pacer";
      elements.legacyFlag.textContent = state.selectedHorse.legacy ? "Legacy boosted" : "";

      Object.entries(state.selectedHorse.stats).forEach(([stat, value]) => {
        const bar = statBars[stat];
        if (!bar) return;
        bar.bar.style.width = `${clamp(value, 0, 100)}%`;
        bar.value.textContent = value;
      });

      updateMoodUI();
      renderSkills();
    } else {
      elements.horseName.textContent = "No horse selected";
      elements.sessions.textContent = "0";
      elements.horseStyle.textContent = "--";
      elements.legacyFlag.textContent = "";
      elements.skillList.innerHTML = "";
    }

    renderTrainingLog();
  }

  function ensureHorseSchema(horse) {
    if (!horse) return;

    if (typeof horse.mood !== "number") {
      horse.mood = 75;
    }

    if (!horse.style || !RACING_STYLES[horse.style]) {
      horse.style = "Pacer";
    }

    const coreStats = ["stride", "endurance", "force", "resolve", "insight"];
    horse.stats = horse.stats || {};
    coreStats.forEach((key) => {
      if (typeof horse.stats[key] !== "number") {
        horse.stats[key] = 50;
      }
    });

    horse.modifiers = horse.modifiers || {};
    const mods = horse.modifiers;
    if (typeof mods.trainingBonus !== "number") {
      mods.trainingBonus = horse.legacy ? 0.12 : 0.05;
    }
    if (typeof mods.skillChanceBonus !== "number") {
      mods.skillChanceBonus = horse.legacy ? 0.12 : 0.05;
    }
    if (typeof mods.legendaryLuck !== "number") {
      mods.legendaryLuck = horse.legacy ? 0.25 : 0.08;
    }
    if (typeof mods.secondaryBonus !== "number") {
      mods.secondaryBonus = horse.legacy ? 0.2 : 0.08;
    }

    if (!horse.version || horse.version < 3) {
      horse.version = 3;
    }

    if (!horse.skills) {
      horse.skills = [];
    }

    updateHorseProfile(horse);
  }

  function updateMoodUI() {
    const moodBar = statBars.mood;
    if (!moodBar || !state.selectedHorse) return;
    const mood = clamp(Math.round(state.selectedHorse.mood ?? 0), 0, 100);
    moodBar.bar.style.width = `${mood}%`;
    moodBar.value.textContent = `${mood}%`;
  }

  function renderSkills() {
    elements.skillList.innerHTML = "";
    if (!state.selectedHorse || !state.selectedHorse.skills) return;
    
    const rarityLabels = {
      1: "Common",
      2: "Uncommon",
      3: "Rare",
      4: "Epic",
      5: "Legendary"
    };
    state.selectedHorse.skills.forEach((skill) => {
      const li = document.createElement("li");
      const description = skill.description || skill.meta?.summary || formatSkillSummary(skill);
      const rarityText = rarityLabels[skill.rarity || 1] || "Common";
      li.innerHTML = `<strong>${skill.name}</strong><br/><small>${description} • ${rarityText}</small>`;
      elements.skillList.appendChild(li);
    });
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

  function showScreen(screen) {
    state.currentScreen = screen;
    
    // Hide all screens
    elements.mapMenu.hidden = true;
    elements.trainingScreen.hidden = true;
    elements.paddockScreen.hidden = true;
    elements.raceSelectionScreen.hidden = true;
    elements.raceScreen.hidden = true;
    elements.retiredScreen.hidden = true;
    
    // Show selected screen
    switch (screen) {
      case "map":
        elements.mapMenu.hidden = false;
        break;
      case "training":
        elements.trainingScreen.hidden = false;
        renderTrainingScreen();
        break;
      case "paddock":
        elements.paddockScreen.hidden = false;
        renderPaddockScreen();
        break;
      case "race-selection":
        elements.raceSelectionScreen.hidden = false;
        renderRaceSelectionScreen();
        break;
      case "race":
        elements.raceScreen.hidden = false;
        drawRaceIdle();
        break;
      case "retired":
        elements.retiredScreen.hidden = false;
        renderRetiredScreen();
        break;
    }
  }

  function handleLocationClick(location) {
    switch (location) {
      case "training":
        if (!state.selectedHorse) {
          alert("Please select a horse from the Paddock first!");
          return;
        }
        showScreen("training");
        break;
      case "paddock":
        showScreen("paddock");
        break;
      case "race":
        showScreen("race-selection");
        break;
      case "retired":
        showScreen("retired");
        break;
    }
  }

  // ============================================================================
  // TRAINING GROUNDS SCREEN
  // ============================================================================
  function renderTrainingScreen() {
    if (!state.selectedHorse) return;
    
    elements.trainingOptions.innerHTML = "";
    
    const stats = ["stride", "endurance", "force", "resolve", "insight"];
    stats.forEach(stat => {
      const duration = 3 + Math.random() * 2; // 3-5 seconds
      const likelihood = 40 + Math.random() * 30; // 40-70%
      
      const optionDiv = document.createElement("div");
      optionDiv.className = "training-option";
      if (state.trainingInProgress) {
        optionDiv.classList.add("training-active");
      }
      
      optionDiv.innerHTML = `
        <div class="training-option-info">
          <h3>${capitalize(stat)}</h3>
          <div class="training-option-meta">
            <span>Time: ${duration.toFixed(1)}s</span>
            <span>Success Rate: ${likelihood.toFixed(0)}%</span>
          </div>
        </div>
        <button class="primary" data-stat="${stat}" data-duration="${duration}" data-likelihood="${likelihood}">
          Start Training
        </button>
      `;
      
      const button = optionDiv.querySelector("button");
      button.addEventListener("click", () => {
        handleTraining(stat, duration, likelihood);
      });
      
      elements.trainingOptions.appendChild(optionDiv);
    });
  }

  function handleTraining(stat, duration, likelihood) {
    if (state.trainingInProgress) return;
    if (!state.selectedHorse || state.selectedHorse.sessions <= 0) {
      addTrainingLog("No training sessions remaining.", "warn");
      return;
    }

    state.trainingInProgress = true;
    addTrainingLog(`Starting ${capitalize(stat)} training...`, "info");
    
    // Disable all training buttons
    document.querySelectorAll(".training-option").forEach(opt => {
      opt.classList.add("training-active");
    });

    setTimeout(() => {
      const success = Math.random() * 100 < likelihood;
      
      if (success) {
        const gain = Math.floor(5 + Math.random() * 8); // 5-12 points
        state.selectedHorse.stats[stat] = clamp(
          (state.selectedHorse.stats[stat] || 50) + gain,
          0,
          100
        );
        addTrainingLog(`${capitalize(stat)} improved by +${gain}!`, "success");
      } else {
        addTrainingLog(`Training completed but no improvement this time.`, "info");
      }
      
      state.selectedHorse.sessions -= 1;
      
      // Mood adjustment
      const moodChange = success ? -3 : -5;
      state.selectedHorse.mood = clamp(
        (state.selectedHorse.mood || 75) + moodChange,
        0,
        100
      );
      
      // Try to unlock skill
      tryUnlockSkill(stat, state.selectedHorse.modifiers || {});
      
      // Save and update
      Storage.updateHorseInPaddock(state.selectedHorse.id, state.selectedHorse);
      state.paddockHorses = Storage.loadPaddockHorses();
      
      state.trainingInProgress = false;
      refreshUI();
      renderTrainingScreen();
      
      if (state.selectedHorse.sessions === 0) {
        addTrainingLog("All training sessions complete! Visit Retired to archive this horse.", "success");
      }
    }, duration * 1000);
  }

  // ============================================================================
  // PADDOCK SCREEN
  // ============================================================================
  function renderPaddockScreen() {
    elements.paddockSlots.innerHTML = "";
    
    for (let i = 0; i < 4; i++) {
      const horse = state.paddockHorses[i];
      const slotDiv = document.createElement("div");
      
      if (horse) {
        const isMain = horse.id === state.mainHorseId;
        slotDiv.className = `paddock-slot ${isMain ? "main-horse" : ""}`;
        
        slotDiv.innerHTML = `
          <div class="slot-header">
            <div class="slot-name">${horse.name}</div>
            ${isMain ? '<div class="slot-badge">MAIN</div>' : ""}
          </div>
          <div class="slot-stats">
            <span>Sessions: ${horse.sessions}</span>
            <span>Style: ${horse.style || "Pacer"}</span>
          </div>
          <div class="slot-stats">
            <span>Stride: ${horse.stats.stride}</span>
            <span>Force: ${horse.stats.force}</span>
            <span>Resolve: ${horse.stats.resolve}</span>
          </div>
          <div class="slot-actions">
            <button class="secondary view-btn" data-id="${horse.id}">View</button>
            ${!isMain ? `<button class="primary set-main-btn" data-id="${horse.id}">Set Main</button>` : ""}
            ${horse.sessions === 0 ? `<button class="primary retire-horse-btn" data-id="${horse.id}">Retire</button>` : ""}
            <button class="danger release-btn" data-id="${horse.id}">Release</button>
          </div>
        `;
        
        slotDiv.querySelector(".view-btn").addEventListener("click", () => {
          state.selectedHorse = horse;
          refreshUI();
        });
        
        const setMainBtn = slotDiv.querySelector(".set-main-btn");
        if (setMainBtn) {
          setMainBtn.addEventListener("click", () => {
            state.mainHorseId = horse.id;
            state.selectedHorse = horse;
            Storage.saveMainHorseId(horse.id);
            refreshUI();
            renderPaddockScreen();
          });
        }
        
        const retireBtn = slotDiv.querySelector(".retire-horse-btn");
        if (retireBtn) {
          retireBtn.addEventListener("click", () => {
            handleRetireHorse(horse);
          });
        }
        
        slotDiv.querySelector(".release-btn").addEventListener("click", () => {
          if (confirm(`Release ${horse.name}? This cannot be undone.`)) {
            Storage.removeHorseFromPaddock(horse.id);
            state.paddockHorses = Storage.loadPaddockHorses();
            if (state.selectedHorse?.id === horse.id) {
              state.selectedHorse = state.paddockHorses[0] || null;
            }
            state.mainHorseId = Storage.loadMainHorseId();
            refreshUI();
            renderPaddockScreen();
          }
        });
      } else {
        slotDiv.className = "paddock-slot empty";
        slotDiv.innerHTML = `
          <div>Empty Slot</div>
          <button class="primary create-horse-btn">Create Horse</button>
          <button class="secondary import-horse-btn">Import from Wallet</button>
        `;
        
        slotDiv.querySelector(".create-horse-btn").addEventListener("click", () => {
          const newHorse = createBaseAvatar({ legacyBonus: false });
          newHorse.id = `horse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          ensureHorseSchema(newHorse);
          
          const result = Storage.addHorseToPaddock(newHorse);
          if (result.success) {
            state.paddockHorses = Storage.loadPaddockHorses();
            if (!state.mainHorseId) {
              state.mainHorseId = newHorse.id;
              Storage.saveMainHorseId(newHorse.id);
            }
            state.selectedHorse = newHorse;
            refreshUI();
            renderPaddockScreen();
          } else {
            alert(result.message);
          }
        });
        
        slotDiv.querySelector(".import-horse-btn").addEventListener("click", () => {
          alert("Importing NFT horse... (Coming soon: MetaMask integration)");
        });
      }
      
      elements.paddockSlots.appendChild(slotDiv);
    }
  }

  // ============================================================================
  // RACE SELECTION SCREEN
  // ============================================================================
  function renderRaceSelectionScreen() {
    elements.horseSelectionList.innerHTML = "";
    
    const availableHorses = state.paddockHorses.filter(h => h && h.sessions >= 0);
    
    if (availableHorses.length === 0) {
      elements.horseSelectionList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          No horses available to race. Create horses in the Paddock first!
        </div>
      `;
      return;
    }
    
    availableHorses.forEach(horse => {
      const cardDiv = document.createElement("div");
      cardDiv.className = "horse-card";
      
      cardDiv.innerHTML = `
        <div class="horse-card-info">
          <h3>${horse.name}</h3>
          <div class="horse-card-stats">
            <span>Stride: ${horse.stats.stride}</span>
            <span>Endurance: ${horse.stats.endurance}</span>
            <span>Force: ${horse.stats.force}</span>
          </div>
        </div>
        <button class="primary select-horse-btn" data-id="${horse.id}">Select</button>
      `;
      
      cardDiv.querySelector(".select-horse-btn").addEventListener("click", () => {
        state.selectedHorse = horse;
        state.mainHorseId = horse.id;
        Storage.saveMainHorseId(horse.id);
        refreshUI();
        showScreen("race");
      });
      
      elements.horseSelectionList.appendChild(cardDiv);
    });
  }

  // ============================================================================
  // RETIRED SCREEN
  // ============================================================================
  function renderRetiredScreen() {
    elements.retiredList.innerHTML = "";
    
    if (state.legacyRecords.length === 0) {
      elements.retiredList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          No retired champions yet.
        </div>
      `;
      return;
    }
    
    state.legacyRecords.forEach(record => {
      const cardDiv = document.createElement("div");
      cardDiv.className = "retired-card";
      
      const retiredAt = new Date(record.retiredAt).toLocaleDateString();
      const skillPreview = record.skills?.length
        ? record.skills.slice(0, 3).map(s => s.name).join(", ")
        : "None";
      
      cardDiv.innerHTML = `
        <div class="retired-card-header">
          <span>${record.name}</span>
          <span>${retiredAt}</span>
        </div>
        <div class="retired-meta">Token: ${record.tokenId} • Style: ${record.style || "Unknown"}</div>
        <div class="retired-meta">Sessions Completed • Mood: ${record.mood ?? 75}%</div>
        <div class="retired-meta">Skills: ${skillPreview}</div>
        <div class="retired-actions">
          <button class="primary attach-btn" data-id="${record.id}">Attach to Horse</button>
        </div>
      `;
      
      cardDiv.querySelector(".attach-btn").addEventListener("click", () => {
        handleAttachRetired(record);
      });
      
      elements.retiredList.appendChild(cardDiv);
    });
  }

  function handleAttachRetired(retiredRecord) {
    if (state.paddockHorses.length === 0) {
      alert("No active horses in paddock to attach to!");
      return;
    }
    
    const horseList = state.paddockHorses
      .map((h, idx) => `${idx + 1}. ${h.name}`)
      .join("\n");
    
    const selection = prompt(
      `Select a horse to attach ${retiredRecord.name}'s legacy to:\n\n${horseList}\n\nEnter number (1-${state.paddockHorses.length}):`
    );
    
    if (!selection) return;
    
    const index = parseInt(selection) - 1;
    if (index >= 0 && index < state.paddockHorses.length) {
      const targetHorse = state.paddockHorses[index];
      
      // Create new legacy horse based on retired and current
      const newHorse = createBaseAvatar({ 
        legacyBonus: true, 
        legacyData: retiredRecord 
      });
      newHorse.id = targetHorse.id;
      newHorse.name = targetHorse.name;
      newHorse.style = retiredRecord.style || targetHorse.style;
      
      // Merge stats
      Object.keys(newHorse.stats).forEach(stat => {
        newHorse.stats[stat] = Math.floor(
          (targetHorse.stats[stat] + retiredRecord.stats[stat]) / 2
        );
      });
      
      ensureHorseSchema(newHorse);
      Storage.updateHorseInPaddock(newHorse.id, newHorse);
      state.paddockHorses = Storage.loadPaddockHorses();
      
      if (state.selectedHorse?.id === newHorse.id) {
        state.selectedHorse = newHorse;
      }
      
      alert(`${retiredRecord.name}'s legacy has been attached to ${targetHorse.name}!`);
      refreshUI();
    } else {
      alert("Invalid selection.");
    }
  }

  function tryUnlockSkill(stat, modifiers = {}) {
    if (!state.selectedHorse || state.selectedHorse.skills.length >= 3) return;

    const insight = state.selectedHorse.stats.insight;
    let chance = 0.1 + Math.max(0, insight - 40) * 0.005;
    chance += state.selectedHorse.modifiers?.skillChanceBonus || 0;
    if (modifiers.legendaryLuck) {
      chance += modifiers.legendaryLuck * 0.4;
    }
    chance = clamp(chance, 0, 0.95);

    if (Math.random() < chance) {
      const existingNames = state.selectedHorse.skills.map((s) => s.name);
      const rarityBias = clamp(
        (modifiers.legendaryLuck || 0) * 1.1 + (modifiers.secondaryBonus || 0) * 0.4,
        0,
        0.8
      );
      const newSkill = pickRandomSkill(existingNames, rarityBias);
      if (newSkill) {
        state.selectedHorse.skills.push(newSkill);
        addTrainingLog(`Unlocked skill: ${newSkill.name}!`, "success");
        
        const moodChange = 4;
        state.selectedHorse.mood = clamp(
          (state.selectedHorse.mood || 75) + moodChange,
          0,
          100
        );
        addTrainingLog(`Skill breakthrough boosted mood +${moodChange}.`, "success");
      }
    } else if (stat === "insight") {
      addTrainingLog("Insight training sharpened instincts. Skill chance increased subtly.", "info");
    }
  }

  function handleRetireHorse(horse) {
    if (!horse) return;
    
    const confirmRetire = window.confirm(
      `Retire ${horse.name}? Their stats and skills will become a legacy record for future horses.`
    );
    if (!confirmRetire) return;

    const record = {
      name: horse.name,
      stats: deepClone(horse.stats),
      skills: deepClone(horse.skills),
      tokenId: state.tokenId,
      retiredAt: Date.now(),
      mood: horse.mood,
      style: horse.style,
      aptitudes: deepClone(horse.aptitudes || {}),
      profile: deepClone(horse.profile || {})
    };

    state.legacyRecords = Storage.addLegacyRecord(record);
    Storage.removeHorseFromPaddock(horse.id);
    state.paddockHorses = Storage.loadPaddockHorses();
    
    if (state.selectedHorse?.id === horse.id) {
      state.selectedHorse = state.paddockHorses[0] || null;
      if (state.selectedHorse) {
        state.mainHorseId = state.selectedHorse.id;
        Storage.saveMainHorseId(state.mainHorseId);
      }
    }

    alert(`${horse.name} has been retired and added to the legacy records!`);
    refreshUI();
    showScreen("retired");
  }

  function handleReset() {
    const confirmReset = window.confirm(
      "Reset all data? This will delete all horses, paddock data, and legacy history."
    );
    if (!confirmReset) return;

    Storage.resetAll();
    location.reload();
  }

  function addTrainingLog(text, type = "") {
    state.trainingLog.push({ text, type });
    if (state.trainingLog.length > 10) {
      state.trainingLog.splice(0, state.trainingLog.length - 10);
    }
    renderTrainingLog();
  }


  function derivePerformanceBundle(stats) {
    return buildRacingProfile(stats).performance;
  }

  function updateHorseProfile(horse) {
    if (!horse || !horse.stats) return;
    const profile = buildRacingProfile(horse.stats);
    horse.profile = {
      performance: { ...profile.performance },
      aptitudes: deepClone(profile.aptitudes)
    };
    horse.performance = { ...profile.performance };
    horse.aptitudes = deepClone(profile.aptitudes);
    horse.maneuverRating = profile.performance.maneuver;
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
        if (behind.energy <= PASS_COST_FAIL.min + 1) continue;
        const gap = (ahead.distance - behind.distance + TRACK_LENGTH) % TRACK_LENGTH;
        if (gap <= 0 || gap > PASS_DISTANCE_THRESHOLD) continue;
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
      let desired = racer.targetZone ?? racer.zoneIndex ?? midIndex;

      if (phase === "start") {
        const accelScore = racer.stats.stride + racer.stats.force;
        if (accelScore > 135 || (racer.startAggro || 0) > 0.55) {
          desired = insideIndex;
        } else if (accelScore < 105) {
          desired = midIndex;
        } else {
          desired = sampleRng(race) > 0.5 ? insideIndex : midIndex;
        }
        scheduleStrategy(racer, race, 0.2, 0.5);
      } else if (phase === "middle") {
        if (blocked) {
          if (racer.stats.insight > 60 && racer.performance.maneuver > 55) {
            desired = Math.min(outsideIndex, (racer.zoneIndex ?? midIndex) + 1);
          } else if (racer.stats.resolve > 65) {
            desired = racer.zoneIndex ?? midIndex;
          } else {
            desired = Math.max(midIndex, Math.min(outsideIndex, racer.zoneIndex ?? midIndex));
          }
        } else {
          if ((racer.zoneIndex ?? midIndex) !== insideIndex && energyPct > 50) {
            desired = insideIndex;
          } else if (energyPct < 35) {
            desired = midIndex;
          }
        }
        scheduleStrategy(racer, race, 0.8, 1.4);
      } else {
        desired = outsideIndex;
        if (rank === 1 && !blocked && energyPct > 35) {
          desired = insideIndex;
        }
        if (energyPct < 25) {
          desired = midIndex;
        }
        scheduleStrategy(racer, race, 0.4, 0.7);
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
    let passChance = clamp(behind.performance.maneuver / 100 + (behind.passBonus || 0), 0.05, 0.99);
    if (behind.predictive) {
      passChance = Math.min(0.99, passChance + 0.05);
    }

    const maneuverAdvantage = behind.performance.maneuver >= ahead.performance.maneuver + 2;
    const speedAdvantage = behind.performance.speed >= ahead.performance.speed + 2;
    const progress = (behind.distance % TRACK_LENGTH) / TRACK_LENGTH;
    if (progress >= FINAL_PHASE_START) {
      passChance = Math.min(0.99, passChance + (behind.stats.force + behind.stats.insight) / 400);
    }

    const insightBoost = behind.insightBonusActive ?? behind.insightBonusBase ?? 0;
    if (insightBoost) {
      passChance = clamp(passChance + insightBoost, 0.05, 0.99);
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
    if (!state.selectedHorse) return null;
    
    const seed = Date.now();
    const seedRng = createSeededRng(seed);
    updateHorseProfile(state.selectedHorse);
    const aiBlueprints = Array.from({ length: 3 }, (_, index) =>
      createAIRacer(index, state.selectedHorse.stats, seedRng)
    ).map((blueprint) => deepClone(blueprint));

    const playerProfile = state.selectedHorse.profile || buildRacingProfile(state.selectedHorse.stats);

    return {
      seed,
      aiBlueprints,
      playerSnapshot: {
        name: state.selectedHorse.name,
        stats: deepClone(state.selectedHorse.stats),
        skills: deepClone(state.selectedHorse.skills),
        modifiers: deepClone(state.selectedHorse.modifiers || { trainingBonus: 0, skillChanceBonus: 0 }),
        mood: state.selectedHorse.mood,
        style: state.selectedHorse.style,
        performance: deepClone(playerProfile.performance),
        aptitudes: deepClone(playerProfile.aptitudes),
        profile: deepClone(playerProfile)
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
      racers.push(aiRacer);
    });

    assignInitialLanes(racers);

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
      loggedRoster: false
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
    const useStyle = style || "Pacer";
    const styleLabel = styleName || useStyle;
    const baseProfile = profile ? deepClone(profile) : buildRacingProfile(stats);
    const perfSource = performance ? { ...performance } : { ...baseProfile.performance };
    const baseAptitudes = aptitudes
      ? deepClone(aptitudes)
      : baseProfile.aptitudes || deriveAptitudes(stats, perfSource);
    const maneuverAdjusted = applyStyleAdjustments(perfSource, useStyle);
    const baseSpeed = Math.max(4, 3.2 + maneuverAdjusted.speed * 0.05);
    const acceleration = 4 + maneuverAdjusted.speed * 0.04;
    const handlingFactor = 1 + maneuverAdjusted.handling / 220;
    const maxSpeed = baseSpeed * handlingFactor;
    const staminaDrain = Math.max(0.05, 0.25 + stats.stride / 200 - stats.endurance / 300);

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
      modifiers: modifiers || { trainingBonus: 0, skillChanceBonus: 0 },
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
      lane: 0,
      passCooldown: 0,
      strategyCooldown: 0,
      startAggro: 0,
      lastPhaseLogged: null,
      baseDrain: staminaDrain,
      fatigueThreshold: maxEnergy * 0.3,
      finalBurst: false,
      finalBurstTimer: 0,
      lastPassAttempt: 0,
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
      zoneDecisionFactorActive: 1
    };
    applyPassiveSkills(racerObj);
    applyAptitudeModifiers(racerObj);
    initializeZoneState(racerObj, DEFAULT_ZONE_INDEX);
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

  function computeSlipstreamMultiplier(racer, race) {
    if (!racer.slipstreamBonus) return 1;
    let bonus = 1;
    const threshold = 30;
    race.racers.forEach((other) => {
      if (other === racer || other.finished) return;
      const delta = (other.distance - racer.distance + TRACK_LENGTH) % TRACK_LENGTH;
      const zoneSeparation = Math.abs((other.zoneOffset || 0) - (racer.zoneOffset || 0));
      if (delta > 0 && delta < threshold && zoneSeparation <= 28) {
        const scaled = 1 + racer.slipstreamBonus * (1 - delta / threshold);
        bonus = Math.max(bonus, scaled);
      }
    });
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

    updateZoneState(racer, dt);

    const progress = (racer.distance % TRACK_LENGTH) / TRACK_LENGTH;
    const phase = progress < START_PHASE_LIMIT ? "start" : progress < FINAL_PHASE_START ? "middle" : "final";

    if (phase !== racer.phase) {
      racer.phase = phase;
      maybeTriggerSkills(racer, phase, race);
    }

    const baseSpeed = racer.baseSpeed;
    const styleMultiplier = getStylePhaseMultiplier(racer.style, phase);
    const staminaRatio = Math.max(0, Math.min(1, racer.energy / racer.maxEnergy));
    const energyFactor = Math.max(0.4, staminaRatio);
    const skillMultiplier = resolveSkillMultiplier(racer, dt);
    const resolveBoost = phase === "final" && racer.stats.resolve > 40 ? 1 + (racer.stats.resolve - 40) * 0.005 : 1;
    const moodPercent = clamp(Math.round(racer.mood ?? 70), 0, 120);
    const moodMultiplier = 1 + (moodPercent - 70) * 0.0015;
    const jitterRange = (sampleRng(race) - 0.5) * 0.06 * (racer.jitterFactor || 1);
    const rngJitter = 1 + jitterRange + racer.rngModifier;
    const slipstreamMultiplier = computeSlipstreamMultiplier(racer, race);

    let finalBurstMultiplier = 1;
    if (phase === "final") {
      if (!racer.finalBurst && racer.energy > FINAL_SPRINT_COST + 5) {
        spendStamina(racer, FINAL_SPRINT_COST, "final_sprint", race);
        racer.finalBurst = true;
        racer.finalBurstTimer = 2.5 + racer.stats.resolve / 140;
      }
      if (racer.finalBurstTimer > 0) {
        finalBurstMultiplier += 0.08 + racer.stats.resolve / 400;
        racer.finalBurstTimer -= dt;
      }
    }

    let targetSpeed =
      baseSpeed *
      styleMultiplier *
      energyFactor *
      skillMultiplier *
      resolveBoost *
      moodMultiplier *
      slipstreamMultiplier *
      finalBurstMultiplier *
      rngJitter;

    if (racer.energy <= 0) {
      targetSpeed *= 0.58;
      racer.depleted = true;
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
      fatiguePenalty = Math.min(fatiguePenalty, 1);
      updatedSpeed *= fatiguePenalty;
    }

    racer.speed = updatedSpeed;
    racer.distance += (updatedSpeed * dt) / (racer.distanceMultiplier || 1);

    const intensity = Math.max(0.4, Math.min(1.3, updatedSpeed / Math.max(1, racer.baseSpeed)));
    const shieldFactor = racer.staminaShieldActive ?? racer.staminaShieldBase ?? 1;
    const focusDrainFactor = racer.focusDrainFactorActive ?? racer.focusDrainFactorBase ?? 1;
    const maintainCost = racer.baseDrain * intensity * (racer.energyDrainFactor || 1) * focusDrainFactor * shieldFactor * dt;
    spendStamina(racer, maintainCost, "maintain", race);

    const timeSincePass = race.time - (racer.lastPassAttempt || 0);
    if (!racer.isBlocked && timeSincePass > 2.2 && racer.energy < racer.maxEnergy) {
      const regen = (COAST_REGEN_BASE + (racer.coolRecoveryRate || 0)) * dt;
      recoverStamina(racer, regen);
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
    racer.skills.forEach((skill) => {
      if (skill.type && skill.type !== "active") return;
      if (!skill.trigger) return;
      if (skill.used || skill.active || skill.trigger !== phase) return;

      let chance = 0.3 + racer.stats.insight * 0.002;
      chance += racer.modifiers?.skillChanceBonus || 0;
      const moodPercent = clamp(Math.round(racer.mood ?? 70), 0, 100);
      chance += (moodPercent - 50) * 0.002;

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
      }

      chance = clamp(chance, 0, 0.95);

      if (sampleRng(race) < chance) {
        skill.active = true;
        skill.timer = skill.duration;
        skill.used = true;
        racer.skillToast = { name: skill.name, timer: 1.5 };
        racer.skillLog.push({ name: skill.name, time: race.time, phase });
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
          multiplier *= 1 + skill.boost;
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
      div.innerHTML = `
        <div>
          <strong>${index + 1}. ${racer.name}</strong><br/>
          <small>${roleLabel} • ${styleName}</small>
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

  function drawRacer(racer, width, height) {
    const pos = positionFromDistance(racer.distance, width, height, racer.zoneOffset || 0);
    const carWidth = 28;
    const carHeight = 12;
    const rectX = pos.x - carWidth / 2;
    const rectY = pos.y - carHeight / 2;

    ctx.fillStyle = racer.color;
    ctx.fillRect(rectX, rectY, carWidth, carHeight);

    if (racer.skills.some((skill) => skill.active)) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(rectX - 2, rectY - 2, carWidth + 4, carHeight + 4);
    }

    if (racer.skillToast) {
      const alpha = clamp(racer.skillToast.timer / 1.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(12, 16, 24, 0.85)";
      const toastWidth = 110;
      const toastHeight = 20;
      const toastX = pos.x - toastWidth / 2;
      const toastY = rectY - 26;
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

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(racer.name, pos.x, rectY - 6);
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
})();
