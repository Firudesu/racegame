// Project Stride storage helpers

(() => {
    const STORAGE_KEYS = {
      current: "projectStride-current-avatar",
      token: "projectStride-token-id",
      legacy: "projectStride-legacy-records",
      stable: "projectStride-stable-roster",
      active: "projectStride-active-horse"
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

  function loadStable() {
    const roster = safeParse(localStorage.getItem(STORAGE_KEYS.stable), []);
    return Array.isArray(roster) ? roster : [];
  }

  function saveStable(roster) {
    const payload = Array.isArray(roster) ? roster : [];
    localStorage.setItem(STORAGE_KEYS.stable, JSON.stringify(payload));
  }

  function loadActiveHorseId() {
    return localStorage.getItem(STORAGE_KEYS.active);
  }

  function saveActiveHorseId(id) {
    if (id == null) {
      localStorage.removeItem(STORAGE_KEYS.active);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.active, id);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEYS.current);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.legacy);
    localStorage.removeItem(STORAGE_KEYS.stable);
    localStorage.removeItem(STORAGE_KEYS.active);
  }

  window.ProjectStrideStorage = {
    STORAGE_KEYS,
    loadCurrentAvatar,
    saveCurrentAvatar,
    loadTokenId,
    saveTokenId,
    loadLegacyRecords,
    addLegacyRecord,
    loadStable,
    saveStable,
    loadActiveHorseId,
    saveActiveHorseId,
    resetAll
  };
})();
