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
    derivePerformance
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
    menuScreen: document.getElementById("menu-screen"),
    trainingScreen: document.getElementById("training-screen"),
    raceScreen: document.getElementById("race-screen"),
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

  const Sfx = createSfx();

  function playSfx(name) {
    if (!Sfx) return;
    Sfx.play(name);
  }

  const TRAINING_BASE_GAIN = 8;
  const TRACK_STEP = 1 / 20;
  const LANE_COUNT = 5;
  const LANE_SPACING = 14;
  const PASS_DISTANCE_THRESHOLD = 24;
  const PASS_COOLDOWN = 1.2;
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

    if (!state.tokenId) {
      state.tokenId = generateTokenId();
      Storage.saveTokenId(state.tokenId);
    }

    bindEvents();
    refreshUI();
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
        handleTrain(stat);
      });
    });

    elements.backToMenu.addEventListener("click", () => {
      showScreen("menu");
    });

    elements.raceBack.addEventListener("click", () => {
      stopRace();
      showScreen("menu");
    });

    elements.startRace.addEventListener("click", () => {
      startRace(false);
    });

    elements.resultsBack.addEventListener("click", () => {
      hideResults();
      showScreen("menu");
    });

    elements.resultsReplay.addEventListener("click", () => {
      hideResults();
      if (state.lastRaceConfig) {
        showScreen("race");
        startRace(true);
      }
    });

    window.addEventListener("resize", resizeCanvas);

    if (elements.legacyList) {
      elements.legacyList.addEventListener("click", onLegacyAction);
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
  }

  function ensureAvatarSchema() {
    if (!state.avatar) return;

    if (typeof state.avatar.mood !== "number") {
      state.avatar.mood = 75;
    }

    if (!state.avatar.style || !RACING_STYLES[state.avatar.style]) {
      state.avatar.style = "Pacer";
    }

    if (!state.avatar.version || state.avatar.version < 3) {
      state.avatar.version = 3;
    }

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
    state.avatar.skills.forEach((skill) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${skill.name}</strong><br/><small>${skill.trigger.toUpperCase()} • +${Math.round(
        skill.boost * 100
      )}% for ${skill.duration}s</small>`;
      elements.skillList.appendChild(li);
    });
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

      li.innerHTML = `
        <header>
          <span>${entry.name}</span>
          <span class="legacy-meta">${retiredAt}</span>
        </header>
        <div class="legacy-meta">Token ${entry.tokenId} • Mood ${entry.mood ?? 0}%</div>
        <div class="legacy-meta">Style: ${entry.style || entry.styleName || "Unknown"}</div>
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
    state.trainingLog = [];
    state.lastTrainedStat = null;

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);

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

  function showScreen(screen) {
    state.currentScreen = screen;
    switch (screen) {
      case "menu":
        elements.menuScreen.hidden = false;
        elements.trainingScreen.hidden = true;
        elements.raceScreen.hidden = true;
        break;
      case "training":
        elements.menuScreen.hidden = true;
        elements.trainingScreen.hidden = false;
        elements.raceScreen.hidden = true;
        break;
      case "race":
        elements.menuScreen.hidden = true;
        elements.trainingScreen.hidden = true;
        elements.raceScreen.hidden = false;
        drawRaceIdle();
        break;
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

  function handleTrain(stat) {
    if (state.avatar.sessions <= 0) {
      addTrainingLog("No training sessions remaining.", "warn");
      refreshUI();
      return;
    }

    const sameStat = state.lastTrainedStat === stat;
    const penalty = sameStat ? 0.75 : 1;
    const bonus = 1 + (state.avatar.modifiers?.trainingBonus || 0);
    let gain = Math.round(TRAINING_BASE_GAIN * penalty * bonus);
    gain = Math.max(2, gain);

    playSfx("train");

    state.avatar.stats[stat] = clamp(state.avatar.stats[stat] + gain, 0, 100);
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

    tryUnlockSkill(stat);
    Storage.saveCurrentAvatar(state.avatar);
    refreshUI();

    if (state.avatar.sessions === 0) {
      addTrainingLog("Training complete. Consider retiring to gain legacy bonuses.", "info");
    }
  }

  function tryUnlockSkill(stat) {
    if (state.avatar.skills.length >= 3) return;

    const insight = state.avatar.stats.insight;
    let chance = 0.1 + Math.max(0, insight - 40) * 0.005;
    chance += state.avatar.modifiers?.skillChanceBonus || 0;
    chance = clamp(chance, 0, 0.9);

    if (Math.random() < chance) {
      const existingNames = state.avatar.skills.map((s) => s.name);
      const newSkill = pickRandomSkill(existingNames);
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

    const record = {
      name: state.avatar.name,
      stats: deepClone(state.avatar.stats),
      skills: deepClone(state.avatar.skills),
      tokenId: state.tokenId,
      retiredAt: Date.now(),
      mood: state.avatar.mood,
      style: state.avatar.style
    };

    state.legacyRecords = Storage.addLegacyRecord(record);

    const nextAvatar = createBaseAvatar({ legacyBonus: true, legacyData: record });
    state.avatar = nextAvatar;
    state.tokenId = generateTokenId();
    state.trainingLog = [];
    state.lastTrainedStat = null;

    Storage.saveCurrentAvatar(state.avatar);
    Storage.saveTokenId(state.tokenId);

    addTrainingLog("New legacy avatar created with boosted potential!", "success");
    refreshUI();
    showScreen("menu");
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
    return derivePerformance(stats);
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

  function laneOffset(lane) {
    return (lane - (LANE_COUNT - 1) / 2) * LANE_SPACING;
  }

  function assignInitialLanes(racers) {
    const centerLane = Math.floor(LANE_COUNT / 2);
    let seed = 0;
    racers.forEach((racer) => {
      if (racer.isPlayer) {
        racer.lane = centerLane;
      }
    });

    racers.forEach((racer) => {
      if (racer.isPlayer) return;
      let lane = seed % LANE_COUNT;
      if (lane === centerLane) {
        lane = (lane + 1) % LANE_COUNT;
      }
      racer.lane = lane;
      seed += 1;
    });
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
        const gap = (ahead.distance - behind.distance + TRACK_LENGTH) % TRACK_LENGTH;
        if (gap <= 0 || gap > PASS_DISTANCE_THRESHOLD) continue;
        attemptPass(behind, ahead, race);
      }
    });
  }

  function attemptPass(behind, ahead, race) {
    const racerStyle = behind.style || "Pacer";
    const passChance = clamp(behind.performance.maneuver / 100, 0.05, 0.99);
    const maneuverAdvantage = behind.performance.maneuver >= ahead.performance.maneuver + 2;
    const speedAdvantage = behind.performance.speed >= ahead.performance.speed + 2;
    const roll = race.rng();
    const success = maneuverAdvantage || speedAdvantage || roll < passChance;

    behind.passCooldown = PASS_COOLDOWN;

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
        behind.lane = chosenLane;
        behind.distance += 1;
      behind.passCooldown = PASS_COOLDOWN;
      console.log(
        `%cPass Success%c ${behind.name} (${racerStyle}) moved to lane ${behind.lane}`,
        "color:#58d68d; font-weight:bold;",
        "color:#d0d3e8"
      );
    } else {
      const slowdown = 0.95 - race.rng() * 0.05;
      behind.speed *= slowdown;
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
    const aiBlueprints = Array.from({ length: 3 }, (_, index) =>
      createAIRacer(index, state.avatar.stats, seedRng)
    );

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
          performance: derivePerformanceBundle(state.avatar.stats)
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
      performance: config.playerSnapshot.performance
    });
    racers.push(player);

    config.aiBlueprints.forEach((blueprint, index) => {
      racers.push(
        buildRacer({
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
          performance: blueprint.performance
        })
      );
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
    performance
  }) {
    const maxEnergy = stats.endurance * 10;
    const useStyle = style || "Pacer";
    const styleLabel = styleName || useStyle;
    const perf = performance ? { ...performance } : derivePerformanceBundle(stats, useStyle);
    const maneuverAdjusted = applyStyleAdjustments(perf, useStyle);
    const baseSpeed = Math.max(4, 3.2 + maneuverAdjusted.speed * 0.05);
    const acceleration = 4 + maneuverAdjusted.speed * 0.04;
    const handlingFactor = 1 + maneuverAdjusted.handling / 220;
    const maxSpeed = baseSpeed * handlingFactor;

    return {
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
      baseSpeed,
      maxSpeed,
      acceleration,
      lane: 0,
      passCooldown: 0,
      lastPhaseLogged: null
    };
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
        console.log(
          `${racer.name} | Style ${racer.style} | Lane ${racer.lane} | Speed ${racer.performance.speed} | Handling ${racer.performance.handling} | Maneuver ${racer.performance.maneuver}`
        );
      });
      return;
    }

    const summary = race.racers.map((racer) => ({
      Name: racer.name,
      Style: racer.style,
      Lane: racer.lane,
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

    const progress = (racer.distance % TRACK_LENGTH) / TRACK_LENGTH;
    const phase = progress < 0.25 ? "start" : progress < 0.75 ? "middle" : "final";

    if (phase !== racer.phase) {
      racer.phase = phase;
      maybeTriggerSkills(racer, phase, race);
    }

    const baseSpeed = racer.baseSpeed;
    const styleMultiplier = getStylePhaseMultiplier(racer.style, phase);
    const energyFactor = Math.max(0.4, racer.energy / racer.maxEnergy);
    const skillMultiplier = resolveSkillMultiplier(racer, dt);
    const resolveBoost = phase === "final" && racer.stats.resolve > 40 ? 1 + (racer.stats.resolve - 40) * 0.005 : 1;
    const moodPercent = clamp(Math.round(racer.mood ?? 70), 0, 120);
    const moodMultiplier = 1 + (moodPercent - 70) * 0.0015;
    const rngJitter = 1 + (race.rng() - 0.5) * 0.06 + racer.rngModifier;

    let targetSpeed =
      baseSpeed *
      styleMultiplier *
      energyFactor *
      skillMultiplier *
      resolveBoost *
      moodMultiplier *
      rngJitter;

    if (racer.energy <= 0) {
      targetSpeed *= 0.6;
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
    updatedSpeed = Math.min(updatedSpeed, racer.maxSpeed);
    if (!Number.isFinite(updatedSpeed) || updatedSpeed < 0) {
      updatedSpeed = Math.max(0, targetSpeed);
    }

    racer.speed = updatedSpeed;
    racer.distance += updatedSpeed * dt;

    const energyCost = updatedSpeed * 0.1 * dt;
    racer.energy = Math.max(0, racer.energy - energyCost);

    racer.energySampleTimer += dt;
    if (racer.energySampleTimer >= 1) {
      racer.energySampleTimer = 0;
      const energyPercent = Math.round((racer.energy / racer.maxEnergy) * 100);
      racer.energyHistory.push({ time: race.time, energy: energyPercent });
    }
  }

  function maybeTriggerSkills(racer, phase, race) {
    racer.skills.forEach((skill) => {
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
      }

      chance = clamp(chance, 0, 0.95);

      if (race.rng() < chance) {
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
    racer.skills.forEach((skill) => {
      if (!skill.active) return;
      skill.timer -= dt;
      if (skill.timer > 0) {
        multiplier *= 1 + skill.boost;
      } else {
        skill.active = false;
      }
    });
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
          <strong>Energy</strong>
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
    const pos = positionFromDistance(racer.distance, width, height);
    const laneY = laneOffset(racer.lane);
    const carWidth = 28;
    const carHeight = 12;
    const rectX = pos.x - carWidth / 2;
    const rectY = pos.y + laneY - carHeight / 2;

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
      const suffix = racer.finished
        ? `${racer.finishTime.toFixed(1)}s`
        : `${Math.min(100, Math.round((racer.distance / TRACK_LENGTH) * 100))}% · L${racer.lane}`;
      ctx.fillStyle = racer.isPlayer ? "#5ac8fa" : "#dddddd";
      ctx.fillText(prefix, x + 12, lineY);
      ctx.textAlign = "right";
      ctx.fillText(suffix, x + panelWidth - 12, lineY);
      ctx.textAlign = "left";
    });
  }

  function positionFromDistance(distance, width, height) {
    const progress = (distance % TRACK_LENGTH) / TRACK_LENGTH;
    const theta = -Math.PI / 2 + progress * Math.PI * 2;
    const cx = width / 2;
    const cy = height / 2;
    const a = width * 0.37;
    const b = height * 0.32;

    return {
      x: cx + Math.cos(theta) * a,
      y: cy + Math.sin(theta) * b
    };
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
