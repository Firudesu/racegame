// Project Stride data helpers

(() => {
  const TRACK_LENGTH = 1200;
  const SKILL_LIBRARY = [
    { name: "Rush Surge", trigger: "final", boost: 0.15, duration: 4 },
    { name: "Iron Will", trigger: "final", boost: 0.22, duration: 3.5 },
    { name: "Early Burst", trigger: "start", boost: 0.14, duration: 3 },
    { name: "Steady Rhythm", trigger: "middle", boost: 0.12, duration: 5 },
    { name: "Second Wind", trigger: "middle", boost: 0.18, duration: 3 },
    { name: "Mind Focus", trigger: "start", boost: 0.1, duration: 4 },
    { name: "Resolve Breaker", trigger: "final", boost: 0.2, duration: 4.5 },
    { name: "Insight Flash", trigger: "middle", boost: 0.16, duration: 3.5 }
  ];

  const RACING_STYLES = {
    Leader: {
      key: "Leader",
      label: "Leader",
      phaseBonus: { start: 0.1, middle: 0, final: -0.1 },
      maneuverModifier: -0.1
    },
    Pacer: {
      key: "Pacer",
      label: "Pacer",
      phaseBonus: { start: 0.05, middle: 0.05, final: -0.05 },
      maneuverModifier: 0
    },
    Chaser: {
      key: "Chaser",
      label: "Chaser",
      phaseBonus: { start: -0.05, middle: 0.1, final: 0.05 },
      maneuverModifier: 0.1
    },
    Sprinter: {
      key: "Sprinter",
      label: "Sprinter",
      phaseBonus: { start: -0.1, middle: 0, final: 0.15 },
      maneuverModifier: 0.15
    }
  };

  const STYLE_KEYS = Object.keys(RACING_STYLES);

  function randomName() {
    const prefixes = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const suffix = String(Math.floor(Math.random() * 900 + 100));
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${suffix}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createSeededRng(seed) {
    let state = seed >>> 0;
    return function rng() {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickRandomSkill(existingNames = []) {
    const pool = SKILL_LIBRARY.filter((skill) => !existingNames.includes(skill.name));
    if (!pool.length) return null;
    return deepClone(pool[Math.floor(Math.random() * pool.length)]);
  }

  function createBaseAvatar({ legacyBonus = false, legacyData = null } = {}) {
    const baseStats = {
      stride: 60,
      endurance: 55,
      force: 48,
      resolve: 42,
      insight: 50
    };

    if (legacyData) {
      for (const key of Object.keys(baseStats)) {
        baseStats[key] = clamp(Math.round((baseStats[key] + legacyData.stats[key]) / 2), 35, 80);
      }
    }

    const modifiers = {
      trainingBonus: legacyBonus ? 0.1 : 0,
      skillChanceBonus: legacyBonus ? 0.1 : 0
    };

    const baseMood = legacyData
      ? clamp(Math.round((legacyData.mood ?? 75) * 0.6 + 30), 50, 98)
      : legacyBonus
      ? 85
      : 75;

    return {
      name: randomName(),
      sessions: 5,
      stats: baseStats,
      skills: [],
      mood: baseMood,
      modifiers,
      legacy: legacyBonus,
      createdAt: Date.now(),
      version: 3
    };
  }

  function createAIRacer(index, playerStats, rng) {
    const stats = {};
    const variance = [
      { key: "stride", spread: 8 },
      { key: "endurance", spread: 10 },
      { key: "force", spread: 9 },
      { key: "resolve", spread: 8 },
      { key: "insight", spread: 6 }
    ];

    variance.forEach(({ key, spread }) => {
      const base = playerStats[key];
      const delta = (rng() - 0.5) * spread * 2;
      stats[key] = clamp(Math.round(base + delta), 35, 90);
    });

    const styleKey = STYLE_KEYS[Math.floor(rng() * STYLE_KEYS.length)];
    const style = RACING_STYLES[styleKey];

    const colors = ["#ef5350", "#fbc02d", "#ab47bc"];

    const performance = derivePerformance(stats);

    return {
      name: `AI-${index + 1}`,
      color: colors[index % colors.length],
      stats,
      style: style.label,
      styleKey: style.key,
      styleName: style.label,
      skills: rng() < 0.5 ? [deepClone(SKILL_LIBRARY[Math.floor(rng() * SKILL_LIBRARY.length)])] : [],
      modifiers: { trainingBonus: 0, skillChanceBonus: 0 },
      mood: clamp(Math.round(65 + (rng() - 0.5) * 30), 40, 95),
      performance
    };
  }

  function derivePerformance(stats) {
    const speed = clamp(Math.round(stats.stride * 0.65 + stats.force * 0.35), 25, 100);
    const handling = clamp(Math.round(stats.resolve * 0.45 + stats.insight * 0.55), 25, 100);
    const maneuver = clamp(Math.round(stats.force * 0.4 + stats.insight * 0.6), 25, 100);
    return { speed, handling, maneuver };
  }

  window.ProjectStrideData = {
    TRACK_LENGTH,
    SKILL_LIBRARY,
    RACING_STYLES,
    clamp,
    deepClone,
    createSeededRng,
    pickRandomSkill,
    createBaseAvatar,
    createAIRacer,
    derivePerformance
  };
})();
