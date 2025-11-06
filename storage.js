// Project Stride storage helpers

(() => {
  const STORAGE_KEYS = {
    current: "projectStride-current-avatar",
    token: "projectStride-token-id",
    legacy: "projectStride-legacy-records",
    paddock: "projectStride-paddock-horses",
    mainHorse: "projectStride-main-horse-id"
  };

  function safeParse(raw, fallback = null) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("Failed to parse storage payload", err);
      return fallback;
    }
  }

  function loadCurrentAvatar() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.current));
  }

  function saveCurrentAvatar(avatar) {
    localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(avatar));
  }

  function loadTokenId() {
    return localStorage.getItem(STORAGE_KEYS.token);
  }

  function saveTokenId(tokenId) {
    localStorage.setItem(STORAGE_KEYS.token, tokenId);
  }

  function loadLegacyRecords() {
    const stored = safeParse(localStorage.getItem(STORAGE_KEYS.legacy), []);
    if (!Array.isArray(stored)) return [];

    let mutated = false;
    const normalized = stored.map((record) => {
      const entry = { ...record };
      if (!entry.id) {
        entry.id = `legacy-${entry.retiredAt || Date.now()}`;
        mutated = true;
      }
      if (typeof entry.mood !== "number") {
        entry.mood = 75;
        mutated = true;
      }
      if (!entry.style && entry.styleName) {
        entry.style = entry.styleName;
        mutated = true;
      }
      if (
        (!entry.aptitudes || !entry.profile) &&
        entry.stats &&
        window.ProjectStrideData?.buildRacingProfile
      ) {
        const profile = window.ProjectStrideData.buildRacingProfile(entry.stats);
        entry.profile = profile;
        entry.aptitudes = profile.aptitudes;
        mutated = true;
      }
      return entry;
    });

    if (mutated) {
      localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(normalized.slice(0, 8)));
    }

    return normalized;
  }

  function addLegacyRecord(record) {
    const records = loadLegacyRecords();
    const entry = { ...record };
    if (!entry.id) {
      entry.id = `legacy-${entry.retiredAt || Date.now()}`;
    }
    if (typeof entry.mood !== "number") {
      entry.mood = 75;
    }
    if (!entry.style && entry.styleName) {
      entry.style = entry.styleName;
    }
    if (
      (!entry.aptitudes || !entry.profile) &&
      entry.stats &&
      window.ProjectStrideData?.buildRacingProfile
    ) {
      const profile = window.ProjectStrideData.buildRacingProfile(entry.stats);
      entry.profile = profile;
      entry.aptitudes = profile.aptitudes;
    }

    const existingIndex = records.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      records.splice(existingIndex, 1);
    }

    records.unshift(entry);
    const trimmed = records.slice(0, 8);
    localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(trimmed));
    return trimmed;
  }

  function loadPaddockHorses() {
    const stored = safeParse(localStorage.getItem(STORAGE_KEYS.paddock), []);
    if (!Array.isArray(stored)) return [];
    return stored.map(horse => {
      if (!horse.id) {
        horse.id = `horse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return horse;
    });
  }

  function savePaddockHorses(horses) {
    const validHorses = horses.filter(h => h && h.id).slice(0, 4);
    localStorage.setItem(STORAGE_KEYS.paddock, JSON.stringify(validHorses));
    return validHorses;
  }

  function addHorseToPaddock(horse) {
    const horses = loadPaddockHorses();
    if (horses.length >= 4) {
      return { success: false, message: "Paddock is full (4 horses max)" };
    }
    if (!horse.id) {
      horse.id = `horse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    horses.push(horse);
    savePaddockHorses(horses);
    return { success: true, horse };
  }

  function removeHorseFromPaddock(horseId) {
    const horses = loadPaddockHorses();
    const filtered = horses.filter(h => h.id !== horseId);
    savePaddockHorses(filtered);
    
    const mainId = loadMainHorseId();
    if (mainId === horseId) {
      saveMainHorseId(null);
    }
    
    return filtered;
  }

  function updateHorseInPaddock(horseId, updates) {
    const horses = loadPaddockHorses();
    const index = horses.findIndex(h => h.id === horseId);
    if (index >= 0) {
      horses[index] = { ...horses[index], ...updates };
      savePaddockHorses(horses);
      return horses[index];
    }
    return null;
  }

  function loadMainHorseId() {
    return localStorage.getItem(STORAGE_KEYS.mainHorse);
  }

  function saveMainHorseId(horseId) {
    if (horseId) {
      localStorage.setItem(STORAGE_KEYS.mainHorse, horseId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.mainHorse);
    }
  }

  function getMainHorse() {
    const mainId = loadMainHorseId();
    if (!mainId) return null;
    const horses = loadPaddockHorses();
    return horses.find(h => h.id === mainId) || null;
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEYS.current);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.legacy);
    localStorage.removeItem(STORAGE_KEYS.paddock);
    localStorage.removeItem(STORAGE_KEYS.mainHorse);
  }

  window.ProjectStrideStorage = {
    STORAGE_KEYS,
    loadCurrentAvatar,
    saveCurrentAvatar,
    loadTokenId,
    saveTokenId,
    loadLegacyRecords,
    addLegacyRecord,
    loadPaddockHorses,
    savePaddockHorses,
    addHorseToPaddock,
    removeHorseFromPaddock,
    updateHorseInPaddock,
    loadMainHorseId,
    saveMainHorseId,
    getMainHorse,
    resetAll
  };
})();
