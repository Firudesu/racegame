// Project Stride UI overhaul

(() => {
  const Data = window.ProjectStrideData;
  const Storage = window.ProjectStrideStorage;

  if (!Data || !Storage) {
    console.warn("Project Stride data or storage helpers missing.");
    return;
  }

  const { clamp, deepClone, createBaseAvatar, buildRacingProfile } = Data;

  const MAX_HORSES = 4;
  const TRAINING_LOG_LIMIT = 8;

  const TRAINING_OPTIONS = [
    {
      key: "stride",
      label: "Stride",
      duration: 3,
      chance: 0.7,
      summary: "Improve acceleration and stride efficiency."
    },
    {
      key: "endurance",
      label: "Endurance",
      duration: 5,
      chance: 0.6,
      summary: "Build stamina for longer pushes and stable pacing."
    },
    {
      key: "force",
      label: "Force",
      duration: 4,
      chance: 0.55,
      summary: "Increase raw power output for passes and sprints."
    },
    {
      key: "resolve",
      label: "Resolve",
      duration: 4,
      chance: 0.65,
      summary: "Sharpen late-race focus and recovery under pressure."
    },
    {
      key: "insight",
      label: "Insight",
      duration: 3,
      chance: 0.5,
      summary: "Enhance race awareness and strategic decisions."
    }
  ];

  const elements = {
    tokenId: document.getElementById("token-id"),
    avatarName: document.getElementById("avatar-name"),
    sessions: document.getElementById("avatar-sessions"),
    avatarStyle: document.getElementById("avatar-style"),
    legacyFlag: document.getElementById("legacy-flag"),
    skillList: document.getElementById("skill-list"),
    legacyList: document.getElementById("legacy-list"),
    legacyEmpty: document.getElementById("legacy-empty"),
    flash: document.getElementById("ui-flash"),
    mapButtons: document.querySelectorAll("[data-screen-target]"),
    screens: document.querySelectorAll(".screen"),
    returnButtons: document.querySelectorAll("[data-return]"),
    training: {
      options: document.getElementById("training-options"),
      summary: document.getElementById("training-summary"),
      duration: document.getElementById("training-duration"),
      chance: document.getElementById("training-chance"),
      start: document.getElementById("start-training"),
      timer: document.getElementById("training-timer"),
      status: document.getElementById("training-status"),
      countdown: document.getElementById("training-countdown"),
      log: document.getElementById("training-log")
    },
    paddockGrid: document.getElementById("paddock-grid"),
    contextMenu: document.getElementById("paddock-context"),
    raceStatus: document.getElementById("race-status"),
    raceRoster: document.getElementById("race-roster"),
    retiredList: document.getElementById("retired-list"),
    modal: {
      root: document.getElementById("ui-modal"),
      title: document.getElementById("modal-title"),
      body: document.getElementById("modal-body"),
      footer: document.getElementById("modal-footer")
    }
  };

  const statElements = {
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

  const state = {
    stable: [],
    retired: [],
    activeHorseId: null,
    tokenId: null,
    training: {
      selected: null,
      inProgress: false,
      timerId: null,
      countdownId: null,
      remaining: 0,
      log: []
    },
    flashTimeout: null,
    raceStatusTimeout: null,
    modalHandlers: []
  };

  const UIManager = (() => {
    const screenMap = new Map();
    let active = "map";

    function init() {
      elements.screens.forEach((screen) => {
        const name = screen.getAttribute("data-screen");
        if (name) {
          screenMap.set(name, screen);
        }
      });
      show("map");
    }

    function show(name) {
      screenMap.forEach((node, key) => {
        node.hidden = key !== name;
      });
      active = name;
      closeContextMenu();
    }

    function getActive() {
      return active;
    }

    return { init, show, getActive };
  })();

  init();

  function init() {
    state.tokenId = Storage.loadTokenId() ?? generateTokenId();
    Storage.saveTokenId(state.tokenId);

    state.retired = Storage.loadLegacyRecords() || [];
    state.stable = loadStableRoster();
    if (!state.stable.length) {
      const freshHorse = createHorse({ makeActive: true });
      state.stable.push(freshHorse);
      persistStable();
    }

    const storedActive = Storage.loadActiveHorseId();
    if (storedActive && state.stable.some((horse) => horse.id === storedActive)) {
      state.activeHorseId = storedActive;
    } else {
      state.activeHorseId = state.stable[0]?.id || null;
      Storage.saveActiveHorseId(state.activeHorseId);
    }

    bindEvents();
    UIManager.init();
    renderTrainingOptions();
    refreshStableViews();
    renderLegacyGallery();
    renderTrainingLog();
    renderRaceRoster();
    renderRetiredList();
    showFlash("Welcome back to Project Stride UI sandbox.", "info", 2800);
  }

  function bindEvents() {
    elements.mapButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-screen-target");
        if (target) {
          UIManager.show(target);
          if (target === "training") {
            updateTrainingSummary();
          }
        }
      });
    });

    elements.returnButtons.forEach((button) => {
      button.addEventListener("click", () => {
        UIManager.show("map");
      });
    });

    if (elements.training.start) {
      elements.training.start.addEventListener("click", onStartTraining);
    }

    if (elements.paddockGrid) {
      elements.paddockGrid.addEventListener("click", onPaddockClick);
      elements.paddockGrid.addEventListener("contextmenu", onPaddockContextMenu);
    }

    document.addEventListener("click", (event) => {
      if (!elements.contextMenu) return;
      if (elements.contextMenu.hidden) return;
      if (!elements.contextMenu.contains(event.target)) {
        closeContextMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeContextMenu();
        closeModal();
      }
    });

    if (elements.modal.root) {
      elements.modal.root.addEventListener("click", (event) => {
        if (event.target.matches("[data-close]") || event.target === elements.modal.root) {
          closeModal();
        }
      });
    }

    if (elements.legacyList) {
      elements.legacyList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const action = button.dataset.action;
        const id = button.dataset.id;
        if (action === "revive" && id) {
          handleReviveLegacy(id);
        }
      });
    }
  }

  function loadStableRoster() {
    const stored = Storage.loadStable();
    const roster = Array.isArray(stored) ? stored.slice(0, MAX_HORSES) : [];
    if (roster.length) {
      roster.forEach((horse, index) => {
        roster[index] = ensureHorseSchema(horse);
      });
      return roster;
    }

    const legacyCurrent = Storage.loadCurrentAvatar();
    if (legacyCurrent) {
      const migrated = ensureHorseSchema({ ...legacyCurrent, id: legacyCurrent.id || generateHorseId() });
      Storage.saveStable([migrated]);
      return [migrated];
    }

    return [];
  }

  function ensureHorseSchema(horse) {
    if (!horse) return null;
    const normalized = deepClone(horse);
    normalized.id = normalized.id || generateHorseId();
    normalized.name = normalized.name || `Runner-${normalized.id.slice(-4)}`;
    normalized.sessions = Math.max(0, Number.isFinite(normalized.sessions) ? normalized.sessions : 5);
    normalized.stats = normalized.stats || {};
    const stats = normalized.stats;
    ["stride", "endurance", "force", "resolve", "insight"].forEach((key) => {
      if (typeof stats[key] !== "number") {
        stats[key] = 50;
      } else {
        stats[key] = clamp(Math.round(stats[key]), 0, 100);
      }
    });
    normalized.mood = clamp(Math.round(normalized.mood ?? 75), 0, 100);
    normalized.skills = Array.isArray(normalized.skills) ? normalized.skills : [];
    normalized.modifiers = normalized.modifiers || {};
    normalized.createdAt = normalized.createdAt || Date.now();
    normalized.lastTrainedStat = normalized.lastTrainedStat || null;
    normalized.profile = buildRacingProfile(normalized.stats);
    normalized.performance = normalized.profile.performance;
    normalized.aptitudes = normalized.profile.aptitudes;
    normalized.style = normalized.style || "Pacer";
    normalized.legacy = Boolean(normalized.legacy);
    normalized.version = Math.max(3, normalized.version || 3);
    return normalized;
  }

  function createHorse({ makeActive = false } = {}) {
    const base = createBaseAvatar();
    const horse = ensureHorseSchema({ ...base, id: generateHorseId() });
    if (makeActive) {
      state.activeHorseId = horse.id;
      Storage.saveActiveHorseId(horse.id);
    }
    return horse;
  }

  function getActiveHorse() {
    return state.stable.find((horse) => horse.id === state.activeHorseId) || null;
  }

  function setActiveHorse(id) {
    if (!id) return;
    if (state.activeHorseId === id) return;
    if (!state.stable.some((horse) => horse.id === id)) return;
    state.activeHorseId = id;
    Storage.saveActiveHorseId(id);
    showFlash("Main horse updated.", "info", 2000);
    refreshStableViews();
  }

  function refreshStableViews() {
    const activeHorse = getActiveHorse();
    updateTokenInfo();
    updateSidebar(activeHorse);
    renderSkills(activeHorse);
    renderPaddock();
    renderTrainingOptions();
    updateTrainingSummary();
    renderRaceRoster();
  }

  function updateTokenInfo() {
    if (elements.tokenId) {
      elements.tokenId.textContent = state.tokenId || "--";
    }
  }

  function updateSidebar(horse) {
    if (!horse) {
      if (elements.avatarName) elements.avatarName.textContent = "--";
      if (elements.sessions) elements.sessions.textContent = "0";
      if (elements.avatarStyle) elements.avatarStyle.textContent = "--";
      if (elements.legacyFlag) elements.legacyFlag.textContent = "";
      Object.values(statElements).forEach((stat) => {
        if (stat.bar) stat.bar.style.width = "0%";
        if (stat.value) stat.value.textContent = "0";
      });
      return;
    }

    if (elements.avatarName) elements.avatarName.textContent = horse.name;
    if (elements.sessions) elements.sessions.textContent = horse.sessions;
    if (elements.avatarStyle) elements.avatarStyle.textContent = horse.style;
    if (elements.legacyFlag) elements.legacyFlag.textContent = horse.legacy ? "Legacy boosted" : "";
    Object.entries(statElements).forEach(([key, stat]) => {
      if (!stat) return;
      const value = key === "mood" ? horse.mood : horse.stats?.[key];
      const safeValue = clamp(Number.isFinite(value) ? value : 0, 0, 100);
      if (stat.bar) stat.bar.style.width = `${safeValue}%`;
      if (stat.value) stat.value.textContent = key === "mood" ? `${safeValue}%` : safeValue;
    });
  }

  function renderSkills(horse) {
    if (!elements.skillList) return;
    elements.skillList.innerHTML = "";
    if (!horse || !horse.skills?.length) {
      return;
    }
    horse.skills.forEach((skill) => {
      const li = document.createElement("li");
      const rarity = skill.rarity || 1;
      const labels = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
      const rarityLabel = labels[rarity - 1] || "Common";
      const desc = skill.description || skill.meta?.summary || formatSkillSummary(skill);
      li.innerHTML = `<strong>${skill.name}</strong><br/><small>${desc} • ${rarityLabel}</small>`;
      elements.skillList.appendChild(li);
    });
  }

  function renderLegacyGallery() {
    if (!elements.legacyList || !elements.legacyEmpty) return;
    elements.legacyList.innerHTML = "";
    if (!state.retired.length) {
      elements.legacyEmpty.hidden = false;
      return;
    }
    elements.legacyEmpty.hidden = true;
    state.retired.slice(0, 8).forEach((entry) => {
      const li = document.createElement("li");
      li.className = "legacy-card";
      const retiredAt = entry.retiredAt ? new Date(entry.retiredAt).toLocaleDateString() : "Unknown";
      const mood = clamp(Math.round(entry.mood ?? 0), 0, 100);
      const style = entry.style || entry.styleName || "--";
      const skills = Array.isArray(entry.skills) && entry.skills.length
        ? entry.skills.map((skill) => skill.name).join(", ")
        : "None";
      li.innerHTML = `
        <header>
          <span>${entry.name}</span>
          <span class="legacy-meta">${retiredAt}</span>
        </header>
        <div class="legacy-meta">Mood ${mood}% • Style ${style}</div>
        <div class="legacy-meta">Token ${entry.tokenId || "--"}</div>
        <div class="legacy-meta">Skills: ${skills}</div>
        <div class="legacy-actions">
          <button data-action="revive" data-id="${entry.id}" class="secondary">Revive</button>
        </div>
      `;
      elements.legacyList.appendChild(li);
    });
  }

  function handleReviveLegacy(id) {
    const record = state.retired.find((entry) => entry.id === id);
    if (!record) return;
    if (state.stable.length >= MAX_HORSES) {
      showFlash("Paddock is full. Release a horse to revive another.", "warn", 3000);
      return;
    }
    if (!window.confirm(`Revive a trainee inspired by ${record.name}?`)) return;
    const revived = ensureHorseSchema(createBaseAvatar({ legacyBonus: true, legacyData: record }));
    revived.id = generateHorseId();
    revived.name = `${record.name}-R`;
    state.stable.push(revived);
    state.activeHorseId = revived.id;
    persistStable();
    showFlash(`${revived.name} joined the paddock with legacy boosts.`, "success", 3200);
    refreshStableViews();
  }

  function renderTrainingOptions() {
    if (!elements.training.options) return;
    elements.training.options.innerHTML = "";
    TRAINING_OPTIONS.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "training-option";
      if (state.training.selected === option.key) {
        btn.classList.add("selected");
      }
      btn.dataset.key = option.key;
      btn.innerHTML = `
        <span class="label">${option.label}</span>
        <span class="meta">${option.duration}s • ${(option.chance * 100).toFixed(0)}% success</span>
      `;
      btn.addEventListener("click", () => {
        selectTrainingOption(option.key);
      });
      elements.training.options.appendChild(btn);
    });
    updateTrainingAvailability();
  }

  function selectTrainingOption(key) {
    if (state.training.inProgress) return;
    state.training.selected = key;
    renderTrainingOptions();
    updateTrainingSummary();
  }

  function updateTrainingSummary() {
    const summaryEl = elements.training.summary;
    const durationEl = elements.training.duration;
    const chanceEl = elements.training.chance;
    const activeHorse = getActiveHorse();
    const option = TRAINING_OPTIONS.find((item) => item.key === state.training.selected);

    if (!summaryEl || !durationEl || !chanceEl) return;

    if (!activeHorse) {
      summaryEl.textContent = "No active horse selected. Head to the paddock to create one.";
      durationEl.textContent = "--";
      chanceEl.textContent = "--";
      updateTrainingAvailability();
      return;
    }

    if (!option) {
      const sessionsLabel = activeHorse.sessions === 1 ? "session" : "sessions";
      summaryEl.textContent = `${activeHorse.name} has ${activeHorse.sessions} ${sessionsLabel} remaining.`;
      durationEl.textContent = "--";
      chanceEl.textContent = "--";
      updateTrainingAvailability();
      return;
    }

    summaryEl.textContent = option.summary;
    durationEl.textContent = `${option.duration}s`;
    chanceEl.textContent = `${(option.chance * 100).toFixed(0)}%`;
    updateTrainingAvailability();
  }

  function updateTrainingAvailability() {
    const startButton = elements.training.start;
    if (!startButton) return;
    const activeHorse = getActiveHorse();
    const hasSelection = Boolean(state.training.selected);
    const canTrain = Boolean(activeHorse && activeHorse.sessions > 0 && !state.training.inProgress && hasSelection);
    startButton.disabled = !canTrain;
  }

  function onStartTraining() {
    const option = TRAINING_OPTIONS.find((item) => item.key === state.training.selected);
    const horse = getActiveHorse();
    if (!option || !horse) {
      showFlash("Select a training focus first.", "warn", 2400);
      return;
    }
    if (state.training.inProgress) return;
    if (horse.sessions <= 0) {
      addTrainingLog(`No sessions remaining for ${horse.name}.`, "warn");
      updateTrainingAvailability();
      return;
    }

    state.training.inProgress = true;
    state.training.remaining = option.duration;
    elements.training.timer.hidden = false;
    elements.training.status.textContent = `Training ${horse.name}…`;
    elements.training.countdown.textContent = `${option.duration.toFixed(1)}s`;
    updateTrainingAvailability();

    state.training.timerId = window.setTimeout(() => {
      completeTrainingSession(horse, option);
    }, option.duration * 1000);

    state.training.countdownId = window.setInterval(() => {
      state.training.remaining = Math.max(0, state.training.remaining - 0.1);
      elements.training.countdown.textContent = `${state.training.remaining.toFixed(1)}s`;
    }, 100);
  }

  function completeTrainingSession(horse, option) {
    clearTrainingTimers();
    const chanceRoll = Math.random();
    const success = chanceRoll <= option.chance;
    const gain = success ? Math.max(2, Math.round(2 + Math.random() * 4)) : 0;
    const statKey = option.key;

    horse.sessions = Math.max(0, (horse.sessions ?? 0) - 1);
    if (success) {
      const sameFocusPenalty = horse.lastTrainedStat === statKey ? 0.85 : 1;
      const adjustedGain = Math.max(1, Math.round(gain * sameFocusPenalty));
      horse.stats[statKey] = clamp((horse.stats[statKey] ?? 0) + adjustedGain, 0, 100);
      horse.lastTrainedStat = statKey;
      horse.mood = clamp(Math.round(horse.mood - 2 + Math.random() * 4), 0, 100);
      addTrainingLog(`${horse.name} gained +${adjustedGain} ${capitalize(statKey)}.`, "success");
    } else {
      addTrainingLog(`${horse.name} completed ${option.label} drills without measurable gains.`, "info");
      horse.mood = clamp(Math.round(horse.mood - 1), 0, 100);
    }

    horse.profile = buildRacingProfile(horse.stats);
    horse.performance = horse.profile.performance;
    horse.aptitudes = horse.profile.aptitudes;

    persistStable();
    state.training.inProgress = false;
    elements.training.timer.hidden = true;
    elements.training.status.textContent = "";
    elements.training.countdown.textContent = "";
    updateTrainingSummary();
    refreshStableViews();
  }

  function clearTrainingTimers() {
    if (state.training.timerId) {
      clearTimeout(state.training.timerId);
      state.training.timerId = null;
    }
    if (state.training.countdownId) {
      clearInterval(state.training.countdownId);
      state.training.countdownId = null;
    }
  }

  function addTrainingLog(message, type = "") {
    state.training.log.push({ message, type });
    if (state.training.log.length > TRAINING_LOG_LIMIT) {
      state.training.log.splice(0, state.training.log.length - TRAINING_LOG_LIMIT);
    }
    renderTrainingLog();
  }

  function renderTrainingLog() {
    if (!elements.training.log) return;
    elements.training.log.innerHTML = "";
    if (!state.training.log.length) {
      const empty = document.createElement("div");
      empty.textContent = "No sessions logged yet.";
      elements.training.log.appendChild(empty);
      return;
    }
    state.training.log.forEach((entry) => {
      const div = document.createElement("div");
      if (entry.type) div.classList.add(entry.type);
      div.textContent = entry.message;
      elements.training.log.appendChild(div);
    });
  }

  function renderPaddock() {
    if (!elements.paddockGrid) return;
    elements.paddockGrid.innerHTML = "";
    for (let i = 0; i < MAX_HORSES; i += 1) {
      const horse = state.stable[i];
      const slot = document.createElement("div");
      slot.className = "paddock-slot";
      slot.dataset.slot = String(i);
      if (horse) {
        slot.dataset.horseId = horse.id;
        if (horse.id === state.activeHorseId) {
          slot.classList.add("active");
        }
        slot.innerHTML = `
          <div class="slot-header">
            <span class="horse-name">${horse.name}</span>
            ${horse.id === state.activeHorseId ? '<span class="main-badge">Main</span>' : ""}
          </div>
          <div class="slot-body">
            <div>Stride ${horse.stats.stride}</div>
            <div>Endurance ${horse.stats.endurance}</div>
            <div>Force ${horse.stats.force}</div>
          </div>
          <div class="slot-footer">Right-click for actions</div>
        `;
      } else {
        slot.classList.add("empty");
        slot.innerHTML = `
          <div class="horse-name">Empty Slot</div>
          <div>Click to add a new horse.</div>
        `;
      }
      elements.paddockGrid.appendChild(slot);
    }
  }

  function onPaddockClick(event) {
    const slot = event.target.closest(".paddock-slot");
    if (!slot) return;
    const horseId = slot.dataset.horseId;
    if (!horseId) {
      const rect = slot.getBoundingClientRect();
      openContextMenu(rect.x + rect.width / 2, rect.y + rect.height / 2, buildEmptySlotActions());
      return;
    }
    setActiveHorse(horseId);
  }

  function onPaddockContextMenu(event) {
    const slot = event.target.closest(".paddock-slot");
    if (!slot) return;
    event.preventDefault();
    const horseId = slot.dataset.horseId;
    if (!horseId) {
      openContextMenu(event.clientX, event.clientY, buildEmptySlotActions());
      return;
    }
    const horse = state.stable.find((item) => item.id === horseId);
    if (!horse) return;
    openContextMenu(event.clientX, event.clientY, buildHorseActions(horse));
  }

  function buildEmptySlotActions() {
    return [
      {
        label: "Create Horse",
        action: () => {
          if (state.stable.length >= MAX_HORSES) {
            showFlash("Paddock already has four horses.", "warn", 2800);
            return;
          }
          const horse = createHorse({ makeActive: true });
          state.stable.push(horse);
          persistStable();
          showFlash(`${horse.name} arrived in the paddock.`, "success", 2600);
          refreshStableViews();
        }
      },
      {
        label: "Import from Wallet",
        action: () => {
          showFlash("Importing NFT horse… (placeholder)", "info", 2600);
        }
      }
    ];
  }

  function buildHorseActions(horse) {
    return [
      {
        label: "View Stats",
        action: () => openHorseDetailsModal(horse)
      },
      {
        label: "Set as Main Horse",
        action: () => setActiveHorse(horse.id)
      },
      {
        label: "Release Horse",
        destructive: true,
        action: () => {
          if (!window.confirm(`Release ${horse.name}? This cannot be undone.`)) return;
          state.stable = state.stable.filter((item) => item.id !== horse.id);
          if (state.activeHorseId === horse.id) {
            state.activeHorseId = state.stable[0]?.id || null;
            Storage.saveActiveHorseId(state.activeHorseId);
          }
          persistStable();
          refreshStableViews();
          showFlash(`${horse.name} has been released.`, "warn", 2400);
        }
      }
    ];
  }

  function openContextMenu(x, y, actions) {
    if (!elements.contextMenu) return;
    elements.contextMenu.innerHTML = "";
    actions.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      if (item.destructive) {
        button.classList.add("destructive");
      }
      button.addEventListener("click", () => {
        item.action();
        closeContextMenu();
      });
      elements.contextMenu.appendChild(button);
    });
    elements.contextMenu.style.left = `${x}px`;
    elements.contextMenu.style.top = `${y}px`;
    elements.contextMenu.hidden = false;
  }

  function closeContextMenu() {
    if (elements.contextMenu) {
      elements.contextMenu.hidden = true;
    }
  }

  function renderRaceRoster() {
    if (!elements.raceRoster) return;
    elements.raceRoster.innerHTML = "";
    if (!state.stable.length) {
      const note = document.createElement("div");
      note.textContent = "No active horses available.";
      elements.raceRoster.appendChild(note);
      return;
    }

    state.stable.forEach((horse) => {
      const entry = document.createElement("div");
      entry.className = "race-entry";
      entry.innerHTML = `
        <div>
          <div class="horse-name">${horse.name}</div>
          <div class="horse-stats">Stride ${horse.stats.stride} • Endurance ${horse.stats.endurance} • Force ${horse.stats.force}</div>
        </div>
      `;
      const button = document.createElement("button");
      button.className = "primary";
      button.textContent = "Select";
      button.addEventListener("click", () => startMockRace(horse));
      entry.appendChild(button);
      elements.raceRoster.appendChild(entry);
    });
  }

  function startMockRace(horse) {
    if (!elements.raceStatus) return;
    elements.raceStatus.textContent = `Race Starting… ${horse.name} heading to the gate.`;
    if (state.raceStatusTimeout) {
      clearTimeout(state.raceStatusTimeout);
    }
    state.raceStatusTimeout = window.setTimeout(() => {
      elements.raceStatus.textContent = `${horse.name} ready for AI integration. (Mock sequence complete.)`;
    }, 2200);
  }

  function renderRetiredList() {
    if (!elements.retiredList) return;
    elements.retiredList.innerHTML = "";
    if (!state.retired.length) {
      const empty = document.createElement("div");
      empty.className = "retired-card";
      empty.textContent = "No retired avatars yet. Finish live races to populate this list.";
      elements.retiredList.appendChild(empty);
      return;
    }

    state.retired.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "retired-card";
      const retiredAt = entry.retiredAt ? new Date(entry.retiredAt).toLocaleDateString() : "--";
      const record = entry.record || "0-0-0";
      card.innerHTML = `
        <header>
          <span>${entry.name}</span>
          <span class="meta">Retired ${retiredAt}</span>
        </header>
        <div class="meta">Race Record: ${record}</div>
        <div class="meta">Style: ${entry.style || entry.styleName || "--"}</div>
        <div class="meta">Mood: ${clamp(Math.round(entry.mood ?? 0), 0, 100)}%</div>
        <footer></footer>
      `;
      const footer = card.querySelector("footer");
      const button = document.createElement("button");
      button.textContent = "Attach to Horse";
      button.className = "primary";
      button.disabled = state.stable.length === 0;
      button.addEventListener("click", () => openAttachModal(entry));
      footer.appendChild(button);
      elements.retiredList.appendChild(card);
    });
  }

  function openHorseDetailsModal(horse) {
    const body = document.createElement("div");
    body.innerHTML = `
      <div><strong>Name:</strong> ${horse.name}</div>
      <div><strong>Style:</strong> ${horse.style}</div>
      <div><strong>Mood:</strong> ${horse.mood}%</div>
      <div><strong>Sessions:</strong> ${horse.sessions}</div>
      <div><strong>Stats:</strong></div>
      <ul>
        <li>Stride ${horse.stats.stride}</li>
        <li>Endurance ${horse.stats.endurance}</li>
        <li>Force ${horse.stats.force}</li>
        <li>Resolve ${horse.stats.resolve}</li>
        <li>Insight ${horse.stats.insight}</li>
      </ul>
    `;

    if (horse.skills?.length) {
      const skills = document.createElement("div");
      skills.innerHTML = "<strong>Skills:</strong>";
      const list = document.createElement("ul");
      horse.skills.forEach((skill) => {
        const li = document.createElement("li");
        li.textContent = `${skill.name} (${skill.rarity || 1})`;
        list.appendChild(li);
      });
      body.appendChild(skills);
      body.appendChild(list);
    }

    openModal({
      title: `${horse.name} Overview`,
      body,
      actions: [
        {
          label: "Close",
          action: closeModal
        }
      ]
    });
  }

  function openAttachModal(retiredEntry) {
    const body = document.createElement("div");
    if (!state.stable.length) {
      body.textContent = "No active horses available. Create one in the paddock.";
      openModal({
        title: "Attach Legacy",
        body,
        actions: [{ label: "Close", action: closeModal }]
      });
      return;
    }

    const form = document.createElement("form");
    form.className = "attach-form";
    state.stable.forEach((horse, index) => {
      const option = document.createElement("label");
      option.style.display = "grid";
      option.style.gap = "4px";
      option.style.marginBottom = "12px";
      option.innerHTML = `
        <input type="radio" name="attach-target" value="${horse.id}" ${index === 0 ? "checked" : ""}>
        <span><strong>${horse.name}</strong> • ${horse.style}</span>
        <span class="meta">Stride ${horse.stats.stride} / Endurance ${horse.stats.endurance} / Force ${horse.stats.force}</span>
      `;
      form.appendChild(option);
    });
    body.appendChild(form);

    openModal({
      title: `Attach ${retiredEntry.name}`,
      body,
      actions: [
        {
          label: "Cancel",
          action: closeModal,
          variant: "secondary"
        },
        {
          label: "Attach",
          action: () => {
            const data = new FormData(form);
            const horseId = data.get("attach-target");
            const horse = state.stable.find((item) => item.id === horseId);
            closeModal();
            if (horse) {
              showFlash(`${retiredEntry.name} linked to ${horse.name}. (Placeholder)`, "success", 3200);
            }
          }
        }
      ]
    });
  }

  function openModal({ title, body, actions = [] }) {
    const root = elements.modal.root;
    if (!root) return;
    elements.modal.title.textContent = title;
    elements.modal.body.innerHTML = "";
    if (body instanceof Node) {
      elements.modal.body.appendChild(body);
    } else if (typeof body === "string") {
      elements.modal.body.innerHTML = body;
    }
    elements.modal.footer.innerHTML = "";
    state.modalHandlers.forEach((handler) => handler.element.removeEventListener("click", handler.callback));
    state.modalHandlers = [];

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.variant === "secondary") {
        button.className = "secondary";
      } else if (action.variant === "danger") {
        button.className = "danger";
      } else {
        button.className = "primary";
      }
      button.addEventListener("click", action.action);
      state.modalHandlers.push({ element: button, callback: action.action });
      elements.modal.footer.appendChild(button);
    });
    root.hidden = false;
  }

  function closeModal() {
    const root = elements.modal.root;
    if (!root) return;
    root.hidden = true;
    elements.modal.body.innerHTML = "";
    elements.modal.footer.innerHTML = "";
    state.modalHandlers.forEach((handler) => handler.element.removeEventListener("click", handler.callback));
    state.modalHandlers = [];
  }

  function showFlash(message, type = "info", duration = 2400) {
    if (!elements.flash) return;
    elements.flash.textContent = message;
    elements.flash.hidden = false;
    elements.flash.className = "flash-banner";
    if (type === "warn") {
      elements.flash.classList.add("warn");
    }
    if (type === "success") {
      elements.flash.classList.add("success");
    }
    if (state.flashTimeout) {
      clearTimeout(state.flashTimeout);
    }
    state.flashTimeout = window.setTimeout(() => {
      if (elements.flash) {
        elements.flash.hidden = true;
      }
    }, duration);
  }

  function persistStable() {
    Storage.saveStable(state.stable);
  }

  function generateHorseId() {
    return `horse-${Math.random().toString(36).slice(2, 7)}-${Date.now().toString(36)}`;
  }

  function generateTokenId() {
    return `AVT-${Math.floor(Math.random() * 9000 + 1000)}`;
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

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }
})();
