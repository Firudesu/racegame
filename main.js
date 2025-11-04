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
    createAIRacer
  } = Data;

  const elements = {
    tokenId: document.getElementById("token-id"),
    avatarName: document.getElementById("avatar-name"),
    sessions: document.getElementById("avatar-sessions"),
    legacyFlag: document.getElementById("legacy-flag"),
    skillList: document.getElementById("skill-list"),
    legacyList: document.getElementById("legacy-list"),
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

  const TRAINING_BASE_GAIN = 8;
  const TRACK_STEP = 1 / 20;

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
    elements.legacyFlag.textContent = state.avatar.legacy ? "Legacy boosted" : "";

    Object.entries(state.avatar.stats).forEach(([stat, value]) => {
      const bar = statBars[stat];
      if (!bar) return;
      bar.bar.style.width = `${clamp(value, 0, 100)}%`;
      bar.value.textContent = value;
    });

    updateMoodUI();

    renderSkills();
    renderLegacyInfo();
    updateMenuState();
    renderTrainingLog();
  }

  function ensureAvatarSchema() {
    if (!state.avatar) return;

    if (typeof state.avatar.mood !== "number") {
      state.avatar.mood = 75;
    }

    if (!state.avatar.version || state.avatar.version < 2) {
      state.avatar.version = 2;
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

  function renderLegacyInfo() {
    if (!state.legacyRecords.length) {
      elements.legacyInfo.textContent = "No legacy data";
      return;
    }

    const entry = state.legacyRecords[0];
    const skillNames = entry.skills?.length ? entry.skills.map((s) => s.name).join(", ") : "None";
    const retiredAt = new Date(entry.retiredAt).toLocaleString();
    elements.legacyInfo.innerHTML = `
      <div><strong>${entry.name}</strong> (${entry.tokenId})</div>
      <div>Retired: ${retiredAt}</div>
      <div>Skills: ${skillNames}</div>
    `;
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
      retiredAt: Date.now()
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

  function startRace(isReplay) {
    if (state.race && state.race.running) {
      return;
    }

    const config = isReplay && state.lastRaceConfig ? state.lastRaceConfig : createRaceConfig();
    if (!config) return;

    state.lastRaceConfig = deepClone(config);
    state.race = createRaceInstance(config);
    state.race.isReplay = isReplay;
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
        mood: state.avatar.mood
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
      phaseMultipliers: { start: 1, middle: 1, final: 1 },
      styleKey: "player",
      mood: config.playerSnapshot.mood
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
          phaseMultipliers: blueprint.phaseMultipliers,
          styleKey: blueprint.styleKey,
          styleName: blueprint.styleName,
          mood: blueprint.mood
        })
      );
    });

    return {
      seed: config.seed,
      rng,
      racers,
      time: 0,
      accumulator: 0,
      running: false,
      finishedOrder: [],
      animationId: null,
      aiBlueprints: deepClone(config.aiBlueprints),
      playerSnapshot: deepClone(config.playerSnapshot),
      leaderboard: racers.slice()
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
    phaseMultipliers,
    styleKey,
    styleName,
    mood
  }) {
    const maxEnergy = stats.endurance * 10;
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
      phaseMultipliers: deepClone(phaseMultipliers || { start: 1, middle: 1, final: 1 }),
      styleKey,
      styleName,
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
      skillToast: null
    };
  }

  function runRaceLoop() {
    if (!state.race) return;

    state.race.running = true;
    state.race.accumulator = 0;
    let lastTime = performance.now();

    const step = (now) => {
      if (!state.race || !state.race.running) return;

      const delta = Math.min(0.25, (now - lastTime) / 1000);
      lastTime = now;
      state.race.accumulator += delta;

      while (state.race.accumulator >= TRACK_STEP) {
        updateRace(TRACK_STEP);
        state.race.accumulator -= TRACK_STEP;
      }

      drawRace(state.race);

      if (state.race.running) {
        state.race.animationId = requestAnimationFrame(step);
      }
    };

    state.race.animationId = requestAnimationFrame(step);
  }

  function updateRace(dt) {
    const race = state.race;
    if (!race) return;

    race.time += dt;

    const activeRacers = race.racers.filter((r) => !r.finished);
    const player = race.racers.find((r) => r.isPlayer);

    activeRacers.forEach((racer) => {
      stepRacer(racer, dt, race);
      if (racer.distance >= TRACK_LENGTH && !racer.finished) {
        racer.finished = true;
        racer.finishTime = race.time;
        race.finishedOrder.push(racer);
      }
    });

    updateLeaderboard(race);
    updateHud(player, race);

    if (race.finishedOrder.length === race.racers.length) {
      concludeRace();
    }
  }

  function stepRacer(racer, dt, race) {
    const progress = racer.distance / TRACK_LENGTH;
    const phase = progress < 0.3 ? "start" : progress < 0.8 ? "middle" : "final";

    if (phase !== racer.phase) {
      racer.phase = phase;
      maybeTriggerSkills(racer, phase, race);
    }

    const baseSpeed = racer.stats.stride * 0.12 + racer.stats.force * 0.04;
    const phaseMultiplier = racer.phaseMultipliers[phase] || 1;
    const energyFactor = Math.max(0.4, racer.energy / racer.maxEnergy);
    const skillMultiplier = resolveSkillMultiplier(racer, dt);
    const resolveBoost = phase === "final" && racer.stats.resolve > 40 ? 1 + (racer.stats.resolve - 40) * 0.005 : 1;
    const rngJitter = 1 + (race.rng() - 0.5) * 0.06 + racer.rngModifier;

    let speed = baseSpeed * phaseMultiplier * energyFactor * skillMultiplier * resolveBoost * rngJitter;

    if (racer.energy <= 0) {
      speed *= 0.6;
      racer.depleted = true;
    }

    racer.speed = speed;
    racer.distance += speed * dt;

    const energyCost = speed * 0.1 * dt;
    racer.energy = Math.max(0, racer.energy - energyCost);
  }

  function maybeTriggerSkills(racer, phase, race) {
    racer.skills.forEach((skill) => {
      if (skill.used || skill.active || skill.trigger !== phase) return;

      let chance = 0.3 + racer.stats.insight * 0.002;
      chance += racer.modifiers?.skillChanceBonus || 0;

      if (!racer.isPlayer) {
        if (racer.styleKey === "lead" && phase === "start") {
          chance += 0.1;
        } else if (racer.styleKey === "late" && phase === "final") {
          chance += 0.2;
        }
      }

      chance = clamp(chance, 0, 0.95);

      if (race.rng() < chance) {
        skill.active = true;
        skill.timer = skill.duration;
        skill.used = true;
        racer.skillLog.push({ name: skill.name, time: race.time });
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

    elements.hudPhase.textContent = capitalize(player.phase);
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
  }

  function concludeRace() {
    if (!state.race) return;
    state.race.running = false;
    if (state.race.animationId) {
      cancelAnimationFrame(state.race.animationId);
      state.race.animationId = null;
    }
    elements.startRace.disabled = false;
    showResults(state.race);
  }

  function stopRace() {
    if (!state.race) return;
    state.race.running = false;
    if (state.race.animationId) {
      cancelAnimationFrame(state.race.animationId);
      state.race.animationId = null;
    }
    elements.startRace.disabled = false;
    drawRaceIdle();
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

      div.innerHTML = `
        <div>
          <strong>${index + 1}. ${racer.name}</strong><br/>
          <small>${racer.isPlayer ? "Player" : racer.styleName || "AI"}</small>
        </div>
        <div>
          <div>${timeLabel}</div>
          <div class="skills-used">Skills: ${skillNames}</div>
        </div>
      `;
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
    const radius = 10;

    ctx.fillStyle = racer.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (racer.skills.some((skill) => skill.active)) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(racer.name, pos.x, pos.y - 16);
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
      const prefix = `${index + 1}. ${racer.name}`;
      const suffix = racer.finished
        ? `${racer.finishTime.toFixed(1)}s`
        : `${Math.min(100, Math.round((racer.distance / TRACK_LENGTH) * 100))}%`;
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
})();
