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
      mapScreen: document.getElementById("map-screen"),
      trainingScreen: document.getElementById("training-screen"),
      paddockScreen: document.getElementById("paddock-screen"),
      raceScreen: document.getElementById("race-screen"),
      retiredScreen: document.getElementById("retired-screen"),
      trainingOptions: document.getElementById("training-options"),
      trainingMeta: document.getElementById("training-meta"),
      startTraining: document.getElementById("start-training"),
      trainingTimer: document.getElementById("training-timer"),
      paddockGrid: document.getElementById("paddock-grid"),
      paddockDetail: document.getElementById("paddock-detail"),
      paddockContextMenu: document.getElementById("paddock-context-menu"),
      raceRoster: document.getElementById("race-roster"),
      raceStatus: document.getElementById("race-status"),
      racePlaceholder: document.getElementById("race-placeholder"),
      raceStartPrototype: document.getElementById("race-start-prototype"),
      raceSimWrapper: document.getElementById("race-sim-wrapper"),
      retiredList: document.getElementById("retired-list"),
      startRace: document.getElementById("start-race"),
      raceBack: document.getElementById("race-back"),
      resultsModal: document.getElementById("results-modal"),
      resultsBody: document.getElementById("results-body"),
      resultsBack: document.getElementById("results-back"),
      resultsReplay: document.getElementById("results-replay"),
      raceCanvas: document.getElementById("race-canvas"),
      mapNodes: Array.from(document.querySelectorAll(".map-node")),
      mapRetireButton: document.querySelector('#map-screen button[data-action="retire"]'),
      mapResetButton: document.querySelector('#map-screen button[data-action="reset"]'),
      returnButtons: document.querySelectorAll('[data-return]')
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
    const mapNodeLookup = elements.mapNodes.reduce((acc, node) => {
      const key = node?.dataset?.screenTarget;
      if (key) acc[key] = node;
      return acc;
    }, {});

    const TRAINING_OPTIONS = [
      {
        key: "stride",
        label: "Stride",
        duration: 3.2,
        chance: 0.68,
        summary: "Improves launch speed and rhythm."
      },
      {
        key: "endurance",
        label: "Endurance",
        duration: 4.5,
        chance: 0.62,
        summary: "Extends stamina for longer runs."
      },
      {
        key: "force",
        label: "Force",
        duration: 3.8,
        chance: 0.58,
        summary: "Builds raw power for duels and passes."
      },
      {
        key: "resolve",
        label: "Resolve",
        duration: 4.1,
        chance: 0.55,
        summary: "Bolsters focus for late surges."
      },
      {
        key: "insight",
        label: "Insight",
        duration: 3.6,
        chance: 0.47,
        summary: "Sharpens awareness and skill discovery chances."
      }
    ];

    const TRAINING_OPTION_MAP = TRAINING_OPTIONS.reduce((acc, option) => {
      acc[option.key] = option;
      return acc;
    }, {});

    const screenMap = {
      map: elements.mapScreen,
      training: elements.trainingScreen,
      paddock: elements.paddockScreen,
      race: elements.raceScreen,
      retired: elements.retiredScreen
    };
  let deviceRatio = window.devicePixelRatio || 1;
  let eventsBound = false;
  resizeCanvas();

    const state = {
      avatar: null,
      tokenId: null,
      legacyRecords: [],
      trainingLog: [],
      lastTrainedStat: null,
      currentScreen: "map",
      race: null,
      lastRaceConfig: null,
      paddockSlots: [],
      mainHorseId: null,
      trainingState: {
        selectedKey: null,
        running: false,
        intervalId: null,
        finishTime: 0
      },
      paddockContext: {
        selectedIndex: null
      },
      raceUi: {
        selectedHorseId: null,
        mockTimeoutId: null
      },
      retiredUi: {
        openAttachId: null
      }
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
      ensureHorseId(state.avatar);

    if (!state.tokenId) {
      state.tokenId = generateTokenId();
      Storage.saveTokenId(state.tokenId);
    }

      state.avatar.tokenId = state.tokenId;

      state.paddockSlots = loadPaddockFromStorage();
      ensureAvatarInPaddock();

    bindEvents();
    refreshUI();
      renderTrainingOptions();
      showScreen("map");
    drawRaceIdle();
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

      elements.mapNodes.forEach((node) => {
        node.addEventListener("click", onMapNodeClick);
      });

      if (elements.mapRetireButton) {
        elements.mapRetireButton.addEventListener("click", onRetireClick);
      }

      if (elements.mapResetButton) {
        elements.mapResetButton.addEventListener("click", () => {
          handleReset();
        });
      }

      elements.returnButtons.forEach((button) => {
        button.addEventListener("click", () => {
          showScreen("map");
        });
      });

      if (elements.trainingOptions) {
        elements.trainingOptions.addEventListener("click", onTrainingOptionClick);
      }

      if (elements.startTraining) {
        elements.startTraining.addEventListener("click", beginTrainingSession);
      }

      if (elements.paddockGrid) {
        elements.paddockGrid.addEventListener("click", onPaddockGridClick);
        elements.paddockGrid.addEventListener("contextmenu", onPaddockContextMenu);
      }

      if (elements.paddockContextMenu) {
        elements.paddockContextMenu.addEventListener("click", onPaddockContextMenuAction);
      }

      if (elements.paddockDetail) {
        elements.paddockDetail.addEventListener("click", onPaddockDetailAction);
      }

      document.addEventListener("click", onGlobalPointerDown);
      document.addEventListener("keydown", onGlobalKeyDown);

      if (elements.raceRoster) {
        elements.raceRoster.addEventListener("click", onRaceRosterAction);
      }

      if (elements.raceStartPrototype) {
        elements.raceStartPrototype.addEventListener("click", openPrototypeSimulation);
      }

      if (elements.raceBack) {
        elements.raceBack.addEventListener("click", () => {
          stopRace();
          toggleRaceSimulation(false);
        });
      }

      if (elements.startRace) {
        elements.startRace.addEventListener("click", () => {
          startRace(false);
        });
      }

      elements.resultsBack.addEventListener("click", () => {
        hideResults();
        showScreen("map");
      });

      elements.resultsReplay.addEventListener("click", () => {
        hideResults();
        if (state.lastRaceConfig) {
          showScreen("race");
          toggleRaceSimulation(true);
          startRace(true);
        }
      });

      if (elements.legacyList) {
        elements.legacyList.addEventListener("click", onLegacyAction);
      }

      if (elements.retiredList) {
        elements.retiredList.addEventListener("click", onRetiredListAction);
      }

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
    updateAvatarProfile();
    elements.tokenId.textContent = state.tokenId;
    elements.avatarName.textContent = state.avatar.name;
    elements.sessions.textContent = state.avatar.sessions;
    if (elements.avatarStyle) {
      elements.avatarStyle.textContent = state.avatar.style;
    }
    elements.legacyFlag.textContent = state.avatar.legacy ? "Legacy boosted" : "";

    Object.entries(state.avatar.stats).forEach(([stat, value]) => {
      const bar = statBars[stat];
      if (!bar) return;
      bar.bar.style.width = `${clamp(value, 0, 100)}%`;
      bar.value.textContent = value;
    });

    updateMoodUI();

    renderSkills();
    renderLegacyGallery();
    updateMenuState();
    renderTrainingLog();
      renderTrainingOptions();
      updateTrainingMeta();
      updateTrainingControls();
      renderPaddock();
      renderRaceRoster();
      if (state.currentScreen === "retired") {
        renderRetiredList();
      }
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

    updateAvatarProfile();
    Storage.saveCurrentAvatar(state.avatar);
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
      ensureHorseId(state.avatar);
      state.avatar.tokenId = state.tokenId;
    state.trainingLog = [];
    state.lastTrainedStat = null;

    updateAvatarProfile();

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);

      ensureAvatarInPaddock();
      state.raceUi.selectedHorseId = state.avatar.id;

    addTrainingLog(`Revived a trainee inspired by ${record.name}.`, "success");
    refreshUI();
      showScreen("map");
  }

  function updateMenuState() {
      const trainingNode = mapNodeLookup.training;
      if (trainingNode) {
        const canTrain = state.avatar.sessions > 0;
        trainingNode.disabled = !canTrain;
        trainingNode.classList.toggle("is-disabled", !canTrain);
      }

      if (elements.mapRetireButton) {
        const canRetire = state.avatar.sessions === 0;
        elements.mapRetireButton.disabled = !canRetire;
        elements.mapRetireButton.classList.toggle("is-available", canRetire);
        elements.mapRetireButton.title = canRetire
          ? "Retire this horse and archive their legacy"
          : "Complete all training sessions before retiring";
      }

      const raceNode = mapNodeLookup.race;
      if (raceNode) {
        const hasActiveHorses = state.paddockSlots.some((slot) => slot && !slot.retired);
        raceNode.disabled = !hasActiveHorses;
        raceNode.classList.toggle("is-disabled", !hasActiveHorses);
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

    function renderTrainingOptions() {
      if (!elements.trainingOptions) return;
      elements.trainingOptions.innerHTML = "";
      TRAINING_OPTIONS.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.option = option.key;
        button.className = "training-card";
        if (state.trainingState.selectedKey === option.key) {
          button.classList.add("is-selected");
        }
        if (state.trainingState.running || state.avatar.sessions <= 0) {
          button.disabled = state.trainingState.running;
        }
        button.innerHTML = `
          <span class="title">${option.label}</span>
          <span class="meta">${option.duration.toFixed(1)}s • ${(option.chance * 100).toFixed(0)}% success</span>
          <span class="summary">${option.summary}</span>
        `;
        elements.trainingOptions.appendChild(button);
      });
    }

    function updateTrainingMeta() {
      if (!elements.trainingMeta) return;
      const option = TRAINING_OPTION_MAP[state.trainingState.selectedKey];
      if (!option) {
        elements.trainingMeta.innerHTML = "<p>Select a training focus to preview details.</p>";
        return;
      }
      elements.trainingMeta.innerHTML = `
        <h3>${option.label}</h3>
        <p>${option.summary}</p>
        <ul>
          <li>Time required: ${option.duration.toFixed(1)} seconds</li>
          <li>Likelihood of stat increase: ${(option.chance * 100).toFixed(0)}%</li>
        </ul>
      `;
    }

    function updateTrainingControls() {
      if (!elements.startTraining) return;
      const hasSessions = state.avatar.sessions > 0;
      const running = state.trainingState.running;
      const hasSelection = Boolean(state.trainingState.selectedKey);
      elements.startTraining.disabled = !hasSessions || !hasSelection || running;
      if (!hasSessions) {
        elements.trainingTimer.textContent = "No sessions remaining.";
      } else if (!running && elements.trainingTimer.textContent === "No sessions remaining.") {
        elements.trainingTimer.textContent = "";
      }
    }

    function onMapNodeClick(event) {
      const node = event.currentTarget || event.target.closest(".map-node");
      if (!node || node.disabled) return;
      const target = node.dataset.screenTarget;
      if (!target) return;
      if (target === "training" && state.avatar.sessions <= 0) {
        addTrainingLog("No training sessions remaining.", "warn");
        return;
      }
      showScreen(target);
    }

    function onRetireClick() {
      if (state.avatar.sessions === 0) {
        handleRetire();
      } else {
        addTrainingLog("Complete remaining training sessions before retiring.", "warn");
      }
    }

    function onTrainingOptionClick(event) {
      if (state.trainingState.running) return;
      const button = event.target.closest("[data-option]");
      if (!button) return;
      const key = button.dataset.option;
      if (!key || !TRAINING_OPTION_MAP[key]) return;
      state.trainingState.selectedKey = key;
      renderTrainingOptions();
      updateTrainingMeta();
      updateTrainingControls();
    }

    function beginTrainingSession() {
      if (state.trainingState.running) return;
      const option = TRAINING_OPTION_MAP[state.trainingState.selectedKey];
      if (!option) return;
      if (state.avatar.sessions <= 0) {
        addTrainingLog("No training sessions remaining.", "warn");
        updateTrainingControls();
        return;
      }

      state.trainingState.running = true;
      state.trainingState.finishTime = performance.now() + option.duration * 1000;
      elements.trainingTimer.textContent = `Training… ${option.duration.toFixed(1)}s remaining`;
      updateTrainingControls();
      renderTrainingOptions();

      if (state.trainingState.intervalId) {
        clearInterval(state.trainingState.intervalId);
      }

      state.trainingState.intervalId = setInterval(() => {
        const remainingMs = Math.max(0, state.trainingState.finishTime - performance.now());
        const remaining = remainingMs / 1000;
        if (remaining <= 0.05) {
          clearInterval(state.trainingState.intervalId);
          state.trainingState.intervalId = null;
          completeTrainingSession(option);
          return;
        }
        if (elements.trainingTimer) {
          elements.trainingTimer.textContent = `Training… ${remaining.toFixed(1)}s remaining`;
        }
      }, 100);
    }

    function completeTrainingSession(option) {
      state.trainingState.running = false;
      state.trainingState.finishTime = 0;
      if (elements.trainingTimer) {
        elements.trainingTimer.textContent = "Drill complete. Updating stats…";
      }
      handleTrain(option.key);
      updateTrainingControls();
      renderTrainingOptions();
      setTimeout(() => {
        if (!state.trainingState.running && elements.trainingTimer) {
          elements.trainingTimer.textContent = "";
        }
      }, 1400);
    }

    function cancelTrainingTimer() {
      if (state.trainingState.intervalId) {
        clearInterval(state.trainingState.intervalId);
        state.trainingState.intervalId = null;
      }
      state.trainingState.running = false;
      state.trainingState.finishTime = 0;
      if (elements.trainingTimer) {
        elements.trainingTimer.textContent = "";
      }
    }

    function loadPaddockFromStorage() {
      const stored = Storage.loadPaddockSlots();
      return Array.from({ length: 4 }, (_, index) => {
        const entry = Array.isArray(stored) ? stored[index] : null;
        return entry ? ensureHorseSchema(entry) : null;
      });
    }

    function ensureHorseId(horse) {
      if (!horse) return null;
      if (!horse.id) {
        horse.id = generateHorseId();
      }
      return horse.id;
    }

    function ensureHorseSchema(horse) {
      if (!horse) return null;
      const clone = deepClone(horse);
      ensureHorseId(clone);
      clone.name = clone.name || `Horse-${clone.id.slice(-4)}`;
      clone.sessions = typeof clone.sessions === "number" ? clone.sessions : 5;
      clone.stats = clone.stats || {};
      ["stride", "endurance", "force", "resolve", "insight"].forEach((key) => {
        clone.stats[key] = typeof clone.stats[key] === "number" ? clone.stats[key] : 50;
      });
      clone.mood = typeof clone.mood === "number" ? clone.mood : 75;
      clone.skills = Array.isArray(clone.skills) ? clone.skills : [];
      clone.modifiers = clone.modifiers || {
        trainingBonus: 0.05,
        skillChanceBonus: 0.05,
        legendaryLuck: 0.08,
        secondaryBonus: 0.08
      };
      clone.style = clone.style || clone.styleName || "Pacer";
      clone.trainingLog = Array.isArray(clone.trainingLog)
        ? clone.trainingLog.slice(Math.max(clone.trainingLog.length - 10, 0))
        : [];
      clone.retired = Boolean(clone.retired);
      if (!clone.tokenId) {
        clone.tokenId = generateTokenId();
      }
      return clone;
    }

    function ensureAvatarInPaddock() {
      const snapshot = ensureHorseSchema({
        ...state.avatar,
        tokenId: state.tokenId,
        trainingLog: state.trainingLog
      });
      if (!snapshot) return;
      const index = state.paddockSlots.findIndex((slot) => slot && slot.id === snapshot.id);
      if (index >= 0) {
        state.paddockSlots[index] = snapshot;
        if (state.paddockContext.selectedIndex == null) {
          state.paddockContext.selectedIndex = index;
        }
      } else {
        const emptyIndex = state.paddockSlots.findIndex((slot) => !slot);
        const targetIndex = emptyIndex >= 0 ? emptyIndex : 0;
        state.paddockSlots[targetIndex] = snapshot;
        state.paddockContext.selectedIndex = targetIndex;
      }
      state.mainHorseId = snapshot.id;
      Storage.savePaddockSlots(state.paddockSlots);
    }

    function syncActiveHorseToPaddock() {
      const snapshot = ensureHorseSchema({
        ...state.avatar,
        tokenId: state.tokenId,
        trainingLog: state.trainingLog
      });
      if (!snapshot) return;
      const index = state.paddockSlots.findIndex((slot) => slot && slot.id === snapshot.id);
      if (index >= 0) {
        state.paddockSlots[index] = snapshot;
      } else {
        const emptyIndex = state.paddockSlots.findIndex((slot) => !slot);
        state.paddockSlots[emptyIndex >= 0 ? emptyIndex : 0] = snapshot;
      }
      Storage.savePaddockSlots(state.paddockSlots);
    }

    function renderPaddock() {
      if (!elements.paddockGrid) return;
      elements.paddockGrid.innerHTML = "";
      const slots = state.paddockSlots.length ? state.paddockSlots : [null, null, null, null];
      slots.forEach((slot, index) => {
        const card = document.createElement("div");
        card.className = "paddock-slot";
        card.dataset.index = index;

        if (slot) {
          card.classList.add("is-filled");
          if (slot.id === state.mainHorseId) {
            card.classList.add("is-main");
          }
          if (slot.retired) {
            card.classList.add("is-retired");
          }
          card.innerHTML = `
            <div class="slot-header">
              <span class="slot-name">${slot.name}</span>
              ${slot.id === state.mainHorseId ? '<span class="slot-tag">Main</span>' : ""}
            </div>
            <div class="slot-stats">Stride ${slot.stats.stride} · End ${slot.stats.endurance} · Force ${slot.stats.force}</div>
            <div class="slot-footer">Sessions ${slot.sessions} · Mood ${Math.round(slot.mood)}%</div>
          `;
        } else {
          card.classList.add("is-empty");
          card.innerHTML = `
            <div class="slot-empty">Empty Slot</div>
            <div class="slot-hint">Click to add a horse</div>
          `;
        }

        if (state.paddockContext.selectedIndex === index) {
          card.classList.add("is-selected");
        }

        elements.paddockGrid.appendChild(card);
      });
      updatePaddockDetail();
      hidePaddockContextMenu();
    }

    function updatePaddockDetail() {
      if (!elements.paddockDetail) return;
      const index = state.paddockContext.selectedIndex;
      if (index == null || index < 0 || index >= state.paddockSlots.length) {
        elements.paddockDetail.innerHTML = "<p>Select a slot to view horse details or create a new trainee.</p>";
        return;
      }
      const slot = state.paddockSlots[index];
      if (slot) {
        renderHorseDetail(slot, index);
      } else {
        renderEmptySlotDetail(index);
      }
    }

    function renderHorseDetail(horse, index) {
      if (!elements.paddockDetail) return;
      elements.paddockDetail.classList.remove("is-loading");
      const statsList = ["stride", "endurance", "force", "resolve", "insight"]
        .map((key) => `<li>${capitalize(key)} <span>${horse.stats[key]}</span></li>`)
        .join("");
      const sessionsLabel = horse.sessions === 1 ? "session" : "sessions";
      const mainTag = horse.id === state.mainHorseId ? '<span class="detail-tag">Main</span>' : "";
      elements.paddockDetail.innerHTML = `
        <div class="detail-header">
          <h3>${horse.name} ${mainTag}</h3>
          <div class="detail-meta">Token ${horse.tokenId || "--"}</div>
          <div class="detail-meta">${horse.sessions} ${sessionsLabel} remaining</div>
        </div>
        <div class="detail-body">
          <ul class="detail-stats">${statsList}</ul>
          <div class="detail-mood">Mood ${Math.round(horse.mood)}%</div>
        </div>
        <div class="detail-actions">
          ${horse.id === state.mainHorseId ? "" : `<button type="button" data-detail-action="set-main" data-index="${index}">Set as Main Horse</button>`}
          <button type="button" data-detail-action="release" data-index="${index}" class="danger">Release Horse</button>
        </div>
      `;
    }

    function renderEmptySlotDetail(index) {
      if (!elements.paddockDetail) return;
      elements.paddockDetail.classList.remove("is-loading");
      elements.paddockDetail.innerHTML = `
        <div class="detail-header">
          <h3>Empty Slot</h3>
          <p>Create a trainee or import an NFT horse.</p>
        </div>
        <div class="detail-actions">
          <button type="button" data-detail-action="create" data-index="${index}" class="primary">Create Horse</button>
          <button type="button" data-detail-action="import" data-index="${index}">Import from Wallet</button>
        </div>
        <p class="detail-hint">Imports trigger a placeholder action for now.</p>
      `;
    }

    function onPaddockGridClick(event) {
      const card = event.target.closest(".paddock-slot");
      if (!card) return;
      const index = Number(card.dataset.index);
      if (Number.isNaN(index)) return;
      state.paddockContext.selectedIndex = index;
      renderPaddock();
    }

    function onPaddockContextMenu(event) {
      const card = event.target.closest(".paddock-slot");
      if (!card) return;
      const index = Number(card.dataset.index);
      const horse = state.paddockSlots[index];
      if (!horse) return;
      event.preventDefault();
      state.paddockContext.selectedIndex = index;
      renderPaddock();
      showPaddockContextMenu(event, index);
    }

    function showPaddockContextMenu(event, index) {
      if (!elements.paddockContextMenu) return;
      const menu = elements.paddockContextMenu;
      const bounds = elements.paddockScreen ? elements.paddockScreen.getBoundingClientRect() : null;
      const offsetX = bounds ? event.clientX - bounds.left : event.clientX;
      const offsetY = bounds ? event.clientY - bounds.top : event.clientY;
      menu.style.left = `${Math.max(12, offsetX)}px`;
      menu.style.top = `${Math.max(12, offsetY)}px`;
      menu.dataset.index = index;
      menu.hidden = false;
    }

    function hidePaddockContextMenu() {
      if (!elements.paddockContextMenu) return;
      elements.paddockContextMenu.hidden = true;
      elements.paddockContextMenu.dataset.index = "";
    }

    function onPaddockContextMenuAction(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const menu = elements.paddockContextMenu;
      const index = menu ? Number(menu.dataset.index) : NaN;
      hidePaddockContextMenu();
      if (Number.isNaN(index)) return;
      if (action === "view") {
        state.paddockContext.selectedIndex = index;
        renderPaddock();
      } else if (action === "set-main") {
        setMainHorseByIndex(index);
      } else if (action === "release") {
        releaseHorseAtIndex(index);
      }
    }

    function onPaddockDetailAction(event) {
      const button = event.target.closest("[data-detail-action]");
      if (!button) return;
      const action = button.dataset.detailAction;
      const index = Number(button.dataset.index);
      if (Number.isNaN(index)) return;
      switch (action) {
        case "create":
          createHorseInSlot(index);
          break;
        case "import":
          importHorsePlaceholder(index);
          break;
        case "set-main":
          setMainHorseByIndex(index);
          break;
        case "release":
          releaseHorseAtIndex(index);
          break;
        default:
          break;
      }
    }

    function createHorseInSlot(index) {
      const base = createBaseAvatar();
      ensureHorseId(base);
      base.tokenId = generateTokenId();
      base.trainingLog = [];
      const horse = ensureHorseSchema(base);
      horse.origin = "created";
      state.paddockSlots[index] = horse;
      Storage.savePaddockSlots(state.paddockSlots);
      state.paddockContext.selectedIndex = index;
      addTrainingLog(`Created new trainee ${horse.name}.`, "info");
      renderPaddock();
    }

    function importHorsePlaceholder(index) {
      if (!elements.paddockDetail) return;
      elements.paddockDetail.classList.add("is-loading");
      elements.paddockDetail.innerHTML = `
        <div class="detail-header">
          <h3>Importing NFT horse…</h3>
          <p>Connecting to wallet placeholder. Please wait.</p>
        </div>
      `;
      setTimeout(() => {
        const imported = ensureHorseSchema({
          name: `NFT-${Math.floor(Math.random() * 900 + 100)}`,
          sessions: 5,
          stats: {
            stride: 60 + Math.floor(Math.random() * 15),
            endurance: 55 + Math.floor(Math.random() * 10),
            force: 52 + Math.floor(Math.random() * 12),
            resolve: 48 + Math.floor(Math.random() * 8),
            insight: 50 + Math.floor(Math.random() * 10)
          },
          mood: 82,
          origin: "imported",
          tokenId: `NFT-${Math.floor(Math.random() * 9000 + 1000)}`,
          trainingLog: []
        });
        state.paddockSlots[index] = imported;
        Storage.savePaddockSlots(state.paddockSlots);
        state.paddockContext.selectedIndex = index;
        addTrainingLog(`Importing NFT horse... ${imported.name} is ready for training.`, "info");
        renderPaddock();
      }, 800);
    }

    function setMainHorseByIndex(index, { silent = false } = {}) {
      const horse = state.paddockSlots[index];
      if (!horse) return;
      syncActiveHorseToPaddock();
      state.avatar = ensureHorseSchema(horse);
      state.tokenId = state.avatar.tokenId || state.tokenId || generateTokenId();
      state.avatar.tokenId = state.tokenId;
      state.trainingLog = Array.isArray(horse.trainingLog) ? [...horse.trainingLog] : [];
      state.lastTrainedStat = null;
      state.mainHorseId = state.avatar.id;
      ensureAvatarSchema();
      ensureAvatarInPaddock();
      Storage.saveCurrentAvatar(state.avatar);
      Storage.saveTokenId(state.tokenId);
      if (!silent) {
        addTrainingLog(`Set ${horse.name} as the main horse.`, "info");
      }
      refreshUI();
    }

    function setMainHorseById(id, options) {
      const index = state.paddockSlots.findIndex((slot) => slot && slot.id === id);
      if (index >= 0) {
        setMainHorseByIndex(index, options);
      }
    }

    function releaseHorseAtIndex(index) {
      const horse = state.paddockSlots[index];
      if (!horse) return;
      const isMain = horse.id === state.mainHorseId;
      const confirmRelease = window.confirm(
        `Release ${horse.name}?${isMain ? " This is currently your main horse." : ""}`
      );
      if (!confirmRelease) return;

      state.paddockSlots[index] = null;
      Storage.savePaddockSlots(state.paddockSlots);

      if (isMain) {
        const nextIndex = state.paddockSlots.findIndex((slot) => slot);
        if (nextIndex >= 0) {
          setMainHorseByIndex(nextIndex, { silent: true });
        } else {
          const replacement = ensureHorseSchema(createBaseAvatar());
          replacement.tokenId = generateTokenId();
          state.avatar = replacement;
          state.tokenId = replacement.tokenId;
          state.trainingLog = [];
          state.paddockSlots[0] = replacement;
          state.mainHorseId = replacement.id;
          Storage.saveCurrentAvatar(state.avatar);
          Storage.saveTokenId(state.tokenId);
          ensureAvatarInPaddock();
        }
      }

      state.paddockContext.selectedIndex = state.paddockSlots.findIndex((slot) => slot);
      if (state.paddockContext.selectedIndex === -1) {
        state.paddockContext.selectedIndex = 0;
      }
      renderPaddock();
      refreshUI();
    }

    function onGlobalPointerDown(event) {
      if (!elements.paddockContextMenu || elements.paddockContextMenu.hidden) return;
      const isMenu = event.target.closest("#paddock-context-menu");
      if (isMenu) return;
      const isSlot = event.target.closest(".paddock-slot");
      if (isSlot) return;
      hidePaddockContextMenu();
    }

    function onGlobalKeyDown(event) {
      if (event.key === "Escape") {
        hidePaddockContextMenu();
        if (state.retiredUi.openAttachId) {
          state.retiredUi.openAttachId = null;
          renderRetiredList();
        }
      }
    }

    function getHorseById(id) {
      if (!id) return null;
      return state.paddockSlots.find((slot) => slot && slot.id === id) || null;
    }

    function renderRaceRoster() {
      if (!elements.raceRoster) return;
      const horses = state.paddockSlots.filter((slot) => slot && !slot.retired);
      if (!horses.length) {
        elements.raceRoster.innerHTML = "<p>No active horses available.</p>";
        if (elements.raceStartPrototype) {
          elements.raceStartPrototype.hidden = true;
        }
        return;
      }

      elements.raceRoster.innerHTML = "";
      horses.forEach((horse) => {
        const card = document.createElement("div");
        card.className = "race-entry";
        if (horse.id === state.mainHorseId) {
          card.classList.add("is-main");
        }
        if (horse.id === state.raceUi.selectedHorseId) {
          card.classList.add("is-selected");
        }
        card.innerHTML = `
          <div class="race-entry-body">
            <div class="race-entry-name">${horse.name}</div>
            <div class="race-entry-stats">Stride ${horse.stats.stride} · End ${horse.stats.endurance} · Force ${horse.stats.force}</div>
          </div>
          <div class="race-entry-actions">
            <button type="button" data-action="select" data-id="${horse.id}">Select</button>
          </div>
        `;
        elements.raceRoster.appendChild(card);
      });
      updateRaceUi();
    }

    function updateRaceDetail(horse) {
      if (!elements.racePlaceholder) return;
      if (!horse) {
        elements.racePlaceholder.innerHTML = "";
        return;
      }
      elements.racePlaceholder.innerHTML = `
        <div class="race-card">
          <header>
            <h3>${horse.name}${horse.id === state.mainHorseId ? ' <span class="tag">Main</span>' : ''}</h3>
            <span class="token">Token ${horse.tokenId || "--"}</span>
          </header>
          <ul>
            <li>Stride ${horse.stats.stride}</li>
            <li>Endurance ${horse.stats.endurance}</li>
            <li>Force ${horse.stats.force}</li>
            <li>Resolve ${horse.stats.resolve}</li>
            <li>Insight ${horse.stats.insight}</li>
          </ul>
        </div>
      `;
    }

    function updateRaceUi() {
      if (!elements.raceStartPrototype) return;
      const selected = getHorseById(state.raceUi.selectedHorseId);
      if (!selected) {
        elements.raceStartPrototype.hidden = true;
        if (elements.raceStatus && !state.raceUi.mockTimeoutId) {
          elements.raceStatus.textContent = "Select a horse to start a mock race.";
        }
        return;
      }
      elements.raceStartPrototype.hidden = false;
      const isMain = selected.id === state.mainHorseId;
      elements.raceStartPrototype.textContent = isMain
        ? "Launch Prototype Simulation"
        : "Set as Main & Launch Simulation";
      updateRaceDetail(selected);
    }

    function onRaceRosterAction(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === "select") {
        const horse = getHorseById(id);
        if (!horse) return;
        state.raceUi.selectedHorseId = horse.id;
        startMockRace(horse);
      }
    }

    function startMockRace(horse) {
      stopMockRace();
      state.raceUi.selectedHorseId = horse.id;
      if (elements.raceStatus) {
        elements.raceStatus.textContent = `Race Starting… ${horse.name} lines up at the gates.`;
      }
      if (elements.racePlaceholder) {
        elements.racePlaceholder.innerHTML = `
          <p class="mock-message">Race Starting… (placeholder sequence)</p>
        `;
      }
      state.raceUi.mockTimeoutId = setTimeout(() => {
        if (elements.raceStatus) {
          elements.raceStatus.textContent = `${horse.name} completed the mock run. Future builds will stream live results.`;
        }
        if (elements.racePlaceholder) {
          elements.racePlaceholder.innerHTML = `
            <p class="mock-message">${horse.name} cools down after a virtual sprint.</p>
          `;
        }
        state.raceUi.mockTimeoutId = null;
      }, 2600);
      updateRaceUi();
    }

    function stopMockRace() {
      if (state.raceUi.mockTimeoutId) {
        clearTimeout(state.raceUi.mockTimeoutId);
        state.raceUi.mockTimeoutId = null;
      }
    }

    function toggleRaceSimulation(show, { silent = false } = {}) {
      if (!elements.raceSimWrapper) return;
      elements.raceSimWrapper.hidden = !show;
      if (elements.raceStartPrototype) {
        elements.raceStartPrototype.hidden = show;
      }
      if (!show && !silent) {
        if (elements.raceStatus) {
          elements.raceStatus.textContent = "Select a horse to start a mock race.";
        }
        updateRaceDetail(getHorseById(state.raceUi.selectedHorseId));
      }
      updateRaceUi();
    }

    function openPrototypeSimulation() {
      const horse = getHorseById(state.raceUi.selectedHorseId) || getHorseById(state.mainHorseId);
      if (!horse) return;
      if (horse.id !== state.mainHorseId) {
        setMainHorseById(horse.id, { silent: true });
      } else {
        syncActiveHorseToPaddock();
      }
      toggleRaceSimulation(true);
      if (elements.raceStatus) {
        elements.raceStatus.textContent = `${state.avatar.name} ready for prototype simulation.`;
      }
      drawRaceIdle();
    }

    function renderRetiredList() {
      if (!elements.retiredList) return;
      const records = state.legacyRecords;
      if (!records.length) {
        elements.retiredList.innerHTML = "<p>No retired avatars yet.</p>";
        return;
      }

      const activeHorses = state.paddockSlots.filter((slot) => slot && !slot.retired);
      elements.retiredList.innerHTML = "";

      records.forEach((record) => {
        const card = document.createElement("div");
        card.className = "retired-card";
        card.dataset.id = record.id;
        const date = record.retiredAt ? new Date(record.retiredAt).toLocaleDateString() : "--";
        const recordLine = formatRaceRecord(record.record);
        const attachOpen = state.retiredUi.openAttachId === record.id;
        const attachOptions = activeHorses.length
          ? activeHorses
              .map(
                (horse) => `<button type="button" data-action="attach-select" data-record="${record.id}" data-target="${horse.id}">${horse.name}</button>`
              )
              .join("")
          : "<span class=\"attach-empty\">No active horses available.</span>";

        card.innerHTML = `
          <header>
            <div>
              <h3>${record.name}</h3>
              <span class="retired-date">Retired ${date}</span>
            </div>
            <div class="retired-token">Token ${record.tokenId || "--"}</div>
          </header>
          <div class="retired-body">
            <div class="retired-record">Record: ${recordLine}</div>
            <div class="retired-style">Style: ${record.style || record.styleName || "--"}</div>
          </div>
            <div class="retired-actions">
              <button type="button" data-action="attach" data-id="${record.id}">${attachOpen ? "Close Attach Menu" : "Attach to Horse"}</button>
              <button type="button" data-action="revive" data-id="${record.id}" class="secondary">Revive</button>
          </div>
          <div class="attach-menu" data-attach="${record.id}" ${attachOpen ? "" : "hidden"}>
            <p>Select active horse:</p>
            <div class="attach-options">${attachOptions}</div>
          </div>
        `;

        elements.retiredList.appendChild(card);
      });
    }

    function formatRaceRecord(record) {
      if (!record) return "0-0-0";
      const wins = record.wins ?? record.first ?? 0;
      const places = record.places ?? record.second ?? 0;
      const shows = record.shows ?? record.third ?? 0;
      return `${wins}-${places}-${shows}`;
    }

    function onRetiredListAction(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const recordId = button.dataset.id || button.dataset.record;
      if (!action || !recordId) return;

      if (action === "attach") {
        state.retiredUi.openAttachId = state.retiredUi.openAttachId === recordId ? null : recordId;
        renderRetiredList();
      } else if (action === "attach-select") {
        const targetId = button.dataset.target;
        const horse = getHorseById(targetId);
        const record = state.legacyRecords.find((entry) => entry.id === recordId);
        if (horse && record) {
          addTrainingLog(`Attached legacy of ${record.name} to ${horse.name} (placeholder).`, "info");
        }
        state.retiredUi.openAttachId = null;
        renderRetiredList();
      } else if (action === "revive") {
        handleReviveLegacy(recordId);
        state.retiredUi.openAttachId = null;
        renderRetiredList();
      }
    }

    function showScreen(screen) {
      if (!screenMap[screen]) return;
      if (state.currentScreen === screen) return;
      handleScreenExit(state.currentScreen);
      state.currentScreen = screen;
      Object.entries(screenMap).forEach(([key, node]) => {
        if (!node) return;
        node.hidden = key !== screen;
      });
      handleScreenEnter(screen);
    }

    function handleScreenEnter(screen) {
      switch (screen) {
        case "map":
          updateMenuState();
          break;
        case "training":
          if (!state.trainingState.selectedKey) {
            state.trainingState.selectedKey = TRAINING_OPTIONS[0]?.key || null;
          }
          renderTrainingOptions();
          updateTrainingMeta();
          updateTrainingControls();
          break;
        case "paddock":
          renderPaddock();
          break;
        case "race":
          renderRaceRoster();
          updateRaceUi();
          drawRaceIdle();
          break;
        case "retired":
          renderRetiredList();
          break;
        default:
          break;
      }
    }

    function handleScreenExit(screen) {
      switch (screen) {
        case "training":
          cancelTrainingTimer();
          break;
        case "race":
          stopMockRace();
          toggleRaceSimulation(false, { silent: true });
          break;
        default:
          break;
      }
    }

  function handleTrain(stat) {
    if (state.avatar.sessions <= 0) {
      addTrainingLog("No training sessions remaining.", "warn");
      refreshUI();
      return;
    }

    updateAvatarProfile();
    const beforeProfile = deepClone(state.avatar.profile || buildRacingProfile(state.avatar.stats));
    const modifiers = state.avatar.modifiers || {};
    const legendaryLuck = modifiers.legendaryLuck || 0;
    const secondaryBonus = modifiers.secondaryBonus || 0;

    const sameStat = state.lastTrainedStat === stat;
    const penalty = sameStat ? 0.75 : 1;
    const bonus = 1 + (state.avatar.modifiers?.trainingBonus || 0);
    const variance = 0.85 + Math.random() * (0.45 + legendaryLuck);
    let gain = Math.round(
      TRAINING_BASE_GAIN * penalty * bonus * (1 + secondaryBonus * 0.25) * variance
    );
    gain = Math.max(2, gain);

    playSfx("train");

    state.avatar.stats[stat] = clamp(state.avatar.stats[stat] + gain, 0, 100);

    const secondaryMap = {
      stride: "force",
      endurance: "resolve",
      force: "stride",
      resolve: "insight",
      insight: "resolve"
    };
    const secondaryTarget = secondaryMap[stat];
    if (secondaryTarget) {
      const secondaryChance = 0.25 + secondaryBonus * 0.5 + legendaryLuck * 0.3;
      if (Math.random() < secondaryChance) {
        const secondaryGain = Math.max(1, Math.round(gain * (0.2 + secondaryBonus * 0.3)));
        state.avatar.stats[secondaryTarget] = clamp(
          (state.avatar.stats[secondaryTarget] || 0) + secondaryGain,
          0,
          100
        );
        addTrainingLog(
          `Secondary aptitude improved (${capitalize(secondaryTarget)} +${secondaryGain}).`,
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

    updateAvatarProfile();

    const afterProfile = state.avatar.profile || buildRacingProfile(state.avatar.stats);
    if (beforeProfile && afterProfile) {
      const passingDiff =
        (afterProfile.aptitudes?.passing?.rating || 0) -
        (beforeProfile.aptitudes?.passing?.rating || 0);
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
    }

    tryUnlockSkill(stat, modifiers);
      syncActiveHorseToPaddock();
    Storage.saveCurrentAvatar(state.avatar);
    refreshUI();

    if (state.avatar.sessions === 0) {
      addTrainingLog("Training complete. Consider retiring to gain legacy bonuses.", "info");
    }
  }

  function tryUnlockSkill(stat, modifiers = {}) {
    if (state.avatar.skills.length >= 3) return;

    const insight = state.avatar.stats.insight;
    let chance = 0.1 + Math.max(0, insight - 40) * 0.005;
    chance += state.avatar.modifiers?.skillChanceBonus || 0;
    if (modifiers.legendaryLuck) {
      chance += modifiers.legendaryLuck * 0.4;
    }
    chance = clamp(chance, 0, 0.95);

    if (Math.random() < chance) {
      const existingNames = state.avatar.skills.map((s) => s.name);
      const rarityBias = clamp(
        (modifiers.legendaryLuck || 0) * 1.1 + (modifiers.secondaryBonus || 0) * 0.4,
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
    }
  }

  function handleRetire() {
    const confirmRetire = window.confirm(
      "Retire this avatar? Their stats and skills will become a legacy bonus for the next trainee."
    );
    if (!confirmRetire) return;

      const previousMainId = state.mainHorseId;
      const previousSlotIndex = state.paddockSlots.findIndex((slot) => slot && slot.id === previousMainId);

    const record = {
      name: state.avatar.name,
      stats: deepClone(state.avatar.stats),
      skills: deepClone(state.avatar.skills),
      tokenId: state.tokenId,
      retiredAt: Date.now(),
      mood: state.avatar.mood,
      style: state.avatar.style,
      aptitudes: deepClone(state.avatar.aptitudes || {}),
      profile: deepClone(state.avatar.profile || {})
    };

    state.legacyRecords = Storage.addLegacyRecord(record);

    const nextAvatar = createBaseAvatar({ legacyBonus: true, legacyData: record });
      ensureHorseId(nextAvatar);
    state.avatar = nextAvatar;
      state.tokenId = generateTokenId();
      state.avatar.tokenId = state.tokenId;
    state.trainingLog = [];
    state.lastTrainedStat = null;

    updateAvatarProfile();

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);

      if (previousSlotIndex >= 0) {
        state.paddockSlots[previousSlotIndex] = null;
      }
      ensureAvatarInPaddock();
      state.raceUi.selectedHorseId = state.avatar.id;

    addTrainingLog("New legacy avatar created with boosted potential!", "success");
    refreshUI();
      showScreen("map");
  }

  function handleReset() {
    const confirmReset = window.confirm(
      "Reset all data? This will delete current avatar and legacy history."
    );
    if (!confirmReset) return;

    Storage.resetAll();
    state.trainingLog = [];
    state.lastTrainedStat = null;
    state.legacyRecords = [];
      stopMockRace();
      stopRace();
      cancelTrainingTimer();
      state.paddockSlots = [];
      state.mainHorseId = null;
      state.trainingState.selectedKey = TRAINING_OPTIONS[0]?.key || null;
      state.raceUi.selectedHorseId = null;
      state.retiredUi.openAttachId = null;
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
    const profile = buildRacingProfile(state.avatar.stats);
    state.avatar.profile = {
      performance: { ...profile.performance },
      aptitudes: deepClone(profile.aptitudes)
    };
    state.avatar.performance = { ...profile.performance };
    state.avatar.aptitudes = deepClone(profile.aptitudes);
    state.avatar.maneuverRating = profile.performance.maneuver;
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
    const seed = Date.now();
    const seedRng = createSeededRng(seed);
    updateAvatarProfile();
    const aiBlueprints = Array.from({ length: 3 }, (_, index) =>
      createAIRacer(index, state.avatar.stats, seedRng)
    ).map((blueprint) => deepClone(blueprint));

    const playerProfile = state.avatar.profile || buildRacingProfile(state.avatar.stats);

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

    function generateHorseId() {
      const randomPart = Math.random().toString(36).slice(2, 8);
      const timePart = Date.now().toString(36).slice(-4);
      return `horse-${randomPart}-${timePart}`;
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
