// Project Stride data helpers

(() => {
  const TRACK_LENGTH = 1200;
  const SKILL_LIBRARY = [
    {
      name: "Rush Surge",
      trigger: "final",
      boost: 0.15,
      duration: 4,
      rarity: 1,
      type: "active",
      description: "Final-phase burst of speed."
    },
    {
      name: "Iron Will",
      trigger: "final",
      boost: 0.22,
      duration: 3.5,
      rarity: 2,
      type: "active",
      description: "Late sprint with strong resolve."
    },
    {
      name: "Early Burst",
      trigger: "start",
      boost: 0.14,
      duration: 3,
      rarity: 1,
      type: "active",
      description: "Launchs hard off the line."
    },
    {
      name: "Steady Rhythm",
      trigger: "middle",
      boost: 0.12,
      duration: 5,
      rarity: 1,
      type: "active",
      description: "Maintains pacing through the middle."
    },
    {
      name: "Second Wind",
      trigger: "middle",
      boost: 0.18,
      duration: 3,
      rarity: 2,
      type: "active",
      description: "Recovers energy mid race."
    },
    {
      name: "Mind Focus",
      trigger: "start",
      boost: 0.1,
      duration: 4,
      rarity: 1,
      type: "active",
      description: "Calm start that steadies nerves."
    },
    {
      name: "Resolve Breaker",
      trigger: "final",
      boost: 0.2,
      duration: 4.5,
      rarity: 2,
      type: "active",
      description: "Crushes opponents in final surge."
    },
    {
      name: "Insight Flash",
      trigger: "middle",
      boost: 0.16,
      duration: 3.5,
      rarity: 1,
      type: "active",
      description: "Reads the pack and moves efficiently."
    },
    // Advanced racing skills
    {
      name: "Overtake",
      type: "passive",
      rarity: 2,
      description: "Improves passing decisions when faster than target.",
      effect: { passBonus: 0.12 }
    },
    {
      name: "Slipstream",
      type: "passive",
      rarity: 1,
      description: "Gain a boost when following closely.",
      effect: { slipstreamBonus: 0.07 }
    },
    {
      name: "Defend Line",
      type: "passive",
      rarity: 2,
      description: "Shifts position to deny passing attempts.",
      effect: { defenseBonus: 0.3 }
    },
    {
      name: "Boost",
      type: "active",
      trigger: "final",
      boost: 0.22,
      duration: 2.8,
      rarity: 3,
      description: "Short burst of acceleration and speed."
    },
    {
      name: "Recovery",
      type: "passive",
      rarity: 2,
      description: "Quicker to regain pace after slowdowns.",
      effect: { recoveryFactor: 0.6 }
    },
    {
      name: "Adaptive Drive",
      type: "passive",
      rarity: 3,
      description: "Adjusts driving line and throttle on the fly.",
      effect: { adaptiveFactor: 1.08 }
    },
    {
      name: "Risk Push",
      type: "active",
      trigger: "final",
      boost: 0.28,
      duration: 2.2,
      rarity: 4,
      description: "Huge speed burst with reduced control.",
      effect: { riskPenalty: true }
    },
    {
      name: "Precision Drive",
      type: "passive",
      rarity: 2,
      description: "Smoother cornering and stable line.",
      effect: { handlingBonus: 0.04, jitterFactor: 0.6 }
    },
    {
      name: "Fatigue Drop",
      type: "passive",
      rarity: 3,
      description: "Reduces endurance drain over time.",
      effect: { energyDrainFactor: 0.85 }
    },
    {
      name: "Block Attempt",
      type: "triggered",
      rarity: 2,
      description: "Attempts to shut down passes from behind.",
      effect: { block: true, defenseBonus: 0.2 }
    },
    {
      name: "Predictive Overtake",
      type: "passive",
      rarity: 3,
      description: "Starts passing moves earlier using anticipation.",
      effect: { passBonus: 0.08, cooldownFactor: 0.7, predictive: true }
    },
    {
      name: "Cool Recovery",
      type: "passive",
      rarity: 2,
      description: "Recovers a little stamina at low speeds.",
      effect: { coolRecoveryRate: 0.016 }
    }
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

  function weightedSample(skills) {
    const total = skills.reduce((sum, skill) => sum + (5 - (skill.rarity || 1)), 0);
    let roll = Math.random() * total;
    for (const skill of skills) {
      roll -= 5 - (skill.rarity || 1);
      if (roll <= 0) {
        return skill;
      }
    }
    return skills[skills.length - 1];
  }

  function pickRandomSkill(existingNames = []) {
    const pool = SKILL_LIBRARY.filter((skill) => !existingNames.includes(skill.name));
    if (!pool.length) return null;
    const selected = weightedSample(pool);
    return deepClone(selected);
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
