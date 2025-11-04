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
      const blocked = isBlockedAhead(racer, race);
      racer.isBlocked = blocked;
      if (blocked && now - (racer.lastBlockDrain || 0) > BLOCKED_DRAIN_INTERVAL) {
        spendStamina(racer, BLOCK_STAMINA_TICK, "blocked", race);
        racer.lastBlockDrain = now;
      }
      const rank = getRank(racer, leaderboard);
      let desired = racer.targetZone ?? racer.zoneIndex ?? midIndex;

      if (progress < START_PHASE_LIMIT) {
        const accelScore = racer.stats.stride + racer.stats.force;
        if (accelScore > 135 || (racer.startAggro || 0) > 0.55) {
          desired = insideIndex;
        } else if (accelScore < 105) {
          desired = midIndex;
        } else {
          desired = sampleRng(race) > 0.5 ? insideIndex : midIndex;
        }
        racer.strategyCooldown = randomBetween(race, 0.2, 0.5);
      } else if (progress < FINAL_PHASE_START) {
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
        racer.strategyCooldown = randomBetween(race, 0.8, 1.4);
      } else {
        desired = outsideIndex;
        if (rank === 1 && !blocked && energyPct > 35) {
          desired = insideIndex;
        }
        if (energyPct < 25) {
          desired = midIndex;
        }
        racer.strategyCooldown = randomBetween(race, 0.4, 0.7);
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
      ahead.strategyCooldown = randomBetween(race, PASS_COOLDOWN_MIN * 0.5, PASS_COOLDOWN_MIN);
      behind.strategyCooldown = randomBetween(race, 0.3, 0.6);
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
      behind.strategyCooldown = randomBetween(race, 0.5, 0.8);
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
    player.startAggro = rng();
    player.strategyCooldown = 0.2 + rng() * 0.3;
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
        performance: blueprint.performance
      });
      aiRacer.startAggro = rng();
      aiRacer.strategyCooldown = 0.3 + rng() * 0.5;
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
    performance
  }) {
    const maxEnergy = 100 + stats.endurance * 10;
    const useStyle = style || "Pacer";
    const styleLabel = styleName || useStyle;
    const perf = performance ? { ...performance } : derivePerformanceBundle(stats, useStyle);
    const maneuverAdjusted = applyStyleAdjustments(perf, useStyle);
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
        lastBlockDrain: 0
      };
    applyPassiveSkills(racerObj);
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
    if (racer.handlingBonus) {
      racer.maxSpeed *= 1 + racer.handlingBonus;
    }
    racer.acceleration *= racer.adaptiveFactor;
    racer.handlingPenaltyActive = racer.handlingPenaltyBase;
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
    const maintainCost = racer.baseDrain * intensity * (racer.energyDrainFactor || 1) * dt;
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
    if (!racer.skills) return multiplier;
    racer.skills.forEach((skill) => {
      if (!skill.active) return;
      skill.timer -= dt;
      if (skill.timer > 0) {
        if (typeof skill.boost === "number") {
          multiplier *= 1 + skill.boost;
        }
        if (skill.riskPenalty) {
          handlingPenalty *= 0.85;
        }
      } else {
        skill.active = false;
      }
    });
    racer.handlingPenaltyActive = handlingPenalty;
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
