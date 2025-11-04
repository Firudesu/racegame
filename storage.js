// Project Stride storage helpers

(() => {
  const STORAGE_KEYS = {
    current: "projectStride-current-avatar",
    token: "projectStride-token-id",
    legacy: "projectStride-legacy-records"
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
    return safeParse(localStorage.getItem(STORAGE_KEYS.legacy), []);
  }

  function addLegacyRecord(record) {
    const records = loadLegacyRecords();
    records.unshift(record);
    const trimmed = records.slice(0, 5);
    localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(trimmed));
    return trimmed;
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEYS.current);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.legacy);
  }

  window.ProjectStrideStorage = {
    STORAGE_KEYS,
    loadCurrentAvatar,
    saveCurrentAvatar,
    loadTokenId,
    saveTokenId,
    loadLegacyRecords,
    addLegacyRecord,
    resetAll
  };
})();
