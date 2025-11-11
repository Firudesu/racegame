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
      description: "Recovers energy mid race.",
      effect: { staminaRegen: 0.05 }
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
    {
      name: "Late Surge",
      trigger: "final",
      boost: 0.18,
      duration: 3.5,
      rarity: 3,
      type: "active",
      description: "Stores energy for a decisive finishing drive.",
      effect: { staminaShield: 0.6, zoneBias: "inside", zonePhase: "final" }
    },
    {
      name: "Predict Move",
      type: "passive",
      rarity: 3,
      description: "Anticipates traffic and reacts quicker.",
      effect: { predictive: true, zoneDecisionFactor: 0.75, insightBonus: 0.05 }
    },
    {
      name: "Steady Focus",
      type: "passive",
      rarity: 2,
      description: "Keeps a calm line and saves stamina mid-race.",
      effect: { focusDrain: 0.85, jitterFactor: 0.8, zoneBias: "mid", zonePhase: "middle" }
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
      trigger: "start",
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
      effect: { coolRecoveryRate: 0.002 }
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
    if (value === undefined || value === null) {
      return value;
    }
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

  function weightedSample(skills, rarityBias = 0) {
    if (!skills.length) return null;
    const bias = clamp(rarityBias, 0, 0.75);
    const exponent = clamp(1 - bias, 0.35, 1);
    const weights = skills.map((skill) => {
      const rarity = skill.rarity || 1;
      const base = Math.max(1, 6 - rarity);
      return Math.pow(base, exponent);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < skills.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        return skills[i];
      }
    }
    return skills[skills.length - 1];
  }

  function pickRandomSkill(existingNames = [], rarityBias = 0) {
    const pool = SKILL_LIBRARY.filter((skill) => !existingNames.includes(skill.name));
    if (!pool.length) return null;
    const selected = weightedSample(pool, rarityBias);
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
      trainingBonus: legacyBonus ? 0.12 : 0.05,
      skillChanceBonus: legacyBonus ? 0.12 : 0.05,
      legendaryLuck: legacyBonus ? 0.25 : 0.08,
      secondaryBonus: legacyBonus ? 0.2 : 0.08
    };

    const baseMood = legacyData
      ? clamp(Math.round((legacyData.mood ?? 75) * 0.6 + 30), 50, 98)
      : legacyBonus
      ? 85
      : 75;

    const profile = buildRacingProfile(baseStats);

    return {
      name: randomName(),
      sessions: 5,
      stats: baseStats,
      skills: [],
      mood: baseMood,
      modifiers,
      legacy: legacyBonus,
      createdAt: Date.now(),
      version: 3,
      performance: profile.performance,
      aptitudes: profile.aptitudes,
      profile
    };
  }

  function createAIRacer(index, playerStats, rng) {
    const stats = {};
    const variance = [
      { key: "stride", spread: 10 },      // Player ±5
      { key: "endurance", spread: 10 },   // Player ±5
      { key: "force", spread: 10 },       // Player ±5
      { key: "resolve", spread: 10 },     // Player ±5
      { key: "insight", spread: 10 }      // Player ±5
    ];

    variance.forEach(({ key, spread }) => {
      const playerStat = playerStats[key] || 60;
      const delta = (rng() - 0.5) * spread * 2; // ±5 from player
      stats[key] = clamp(Math.round(playerStat + delta), 35, 95);
    });

    const styleKey = STYLE_KEYS[Math.floor(rng() * STYLE_KEYS.length)];
    const style = RACING_STYLES[styleKey];

    const colors = ["#ef5350", "#fbc02d", "#ab47bc"];

    const profile = buildRacingProfile(stats);
    const performance = profile.performance;

    const availableSkills = SKILL_LIBRARY.slice();
    const assignedSkills = [];
    const pickSkill = (filterFn) => {
      const pool = availableSkills.filter(filterFn);
      if (!pool.length) return null;
      const choice = pool[Math.floor(rng() * pool.length)];
      const idx = availableSkills.indexOf(choice);
      if (idx >= 0) {
        availableSkills.splice(idx, 1);
      }
      return deepClone(choice);
    };

    let primarySkill = pickSkill((skill) => skill.type === "active");
    if (!primarySkill) {
      primarySkill = pickSkill(() => true);
    }
    if (primarySkill) {
      assignedSkills.push(primarySkill);
    }

    if (rng() < 0.4) {
      const secondary = pickSkill(() => true);
      if (secondary) {
        assignedSkills.push(secondary);
      }
    }

    return {
      name: `AI-${index + 1}`,
      color: colors[index % colors.length],
      stats,
      style: style.label,
      styleKey: style.key,
      styleName: style.label,
      skills: assignedSkills,
      modifiers: { trainingBonus: 0, skillChanceBonus: 0, legendaryLuck: 0.1, secondaryBonus: 0.12 },
      mood: clamp(Math.round(65 + (rng() - 0.5) * 30), 40, 95),
      performance,
      aptitudes: profile.aptitudes,
      profile
    };
  }

  function derivePerformance(stats) {
    const speed = clamp(Math.round(stats.stride * 0.65 + stats.force * 0.35), 25, 100);
    const handling = clamp(Math.round(stats.resolve * 0.45 + stats.insight * 0.55), 25, 100);
    const maneuver = clamp(Math.round(stats.force * 0.4 + stats.insight * 0.6), 25, 100);
    return { speed, handling, maneuver };
  }

    function deriveAptitudes(stats, performance = derivePerformance(stats)) {
      const stride = clamp(stats.stride || 0, 0, 100);
      const endurance = clamp(stats.endurance || 0, 0, 100);
      const force = clamp(stats.force || 0, 0, 100);
      const resolve = clamp(stats.resolve || 0, 0, 100);
      const insight = clamp(stats.insight || 0, 0, 100);

      const distanceScore = Math.round(stride * 0.45 + endurance * 0.55);
      let distanceType = "Sprint";
      if (distanceScore >= 78) distanceType = "Long";
      else if (distanceScore >= 68) distanceType = "Medium";
      else if (distanceScore >= 58) distanceType = "Mile";

      const surfaceBalance = resolve * 0.6 + insight * 0.4;
      let surfacePreferred = "Firm";
      if (surfaceBalance >= 72) surfacePreferred = "Wet";
      else if (surfaceBalance >= 55) surfacePreferred = "Balanced";

      const startScore = stride + force * 0.6;
      const middleScore = endurance + insight;
      const finalScore = resolve + force;
      const phaseScores = [
        { phase: "start", value: startScore },
        { phase: "middle", value: middleScore },
        { phase: "final", value: finalScore }
      ].sort((a, b) => b.value - a.value);
      const phaseFocus = phaseScores[0].phase;
      const secondaryPhase = phaseScores[1]?.phase || phaseFocus;

      const maneuverRating = performance.maneuver ?? Math.round(force * 0.4 + insight * 0.6);
      const passingRating = clamp(Math.round((maneuverRating * 0.7 + insight * 0.5) / 1.2), 35, 98);
      let laneBias = "mid";
      if (passingRating >= 75) laneBias = "inside";
      else if (passingRating <= 55) laneBias = "outside";

      const decisionFactor = clamp(1 - (insight - 55) / 180, 0.55, 1.25);
      const staminaReserve = clamp(1 - (resolve - 60) / 200, 0.55, 1);
      const focusDiscipline = clamp(1 - (insight - 50) / 220, 0.6, 1.15);
      const aggression = clamp(Math.round((force + stride) / 2), 35, 95);

      return {
        distance: { type: distanceType, score: distanceScore },
        surface: { preferred: surfacePreferred, adaptability: clamp(Math.round(surfaceBalance), 30, 95) },
        phase: { focus: phaseFocus, secondary: secondaryPhase },
        passing: { rating: passingRating, laneBias, aggression },
        decisionFactor,
        staminaReserve,
        focusDiscipline
      };
    }

    function buildRacingProfile(stats, modifiers = {}) {
      const performance = derivePerformance(stats);
      const aptitudes = deriveAptitudes(stats, performance);
      const secondary = deriveSecondaryStats(stats, modifiers, aptitudes);
      return { performance, aptitudes, secondary };
    }

  function deriveSecondaryStats(stats, modifiers = {}, aptitudes = null) {
    // Derive secondary stats from primary stats
    const stride = clamp(stats.stride || 50, 0, 100);
    const endurance = clamp(stats.endurance || 50, 0, 100);
    const force = clamp(stats.force || 50, 0, 100);
    const resolve = clamp(stats.resolve || 50, 0, 100);
    const insight = clamp(stats.insight || 50, 0, 100);
    
    const secondaryBonus = modifiers.secondaryBonus || 0;
    const baseMult = 1 + secondaryBonus;
    
    // Core racing mechanics
    const maneuverBase = clamp(Math.round((force * 0.4 + insight * 0.6) * baseMult), 30, 98);
    const passingPower = clamp(Math.round((maneuverBase * 0.7 + insight * 0.5) / 1.2 * baseMult), 35, 98);
    const fatigueResistance = clamp(Math.round((resolve * 0.6 + endurance * 0.4) * baseMult), 35, 95);
    const paceControl = clamp(Math.round((endurance * 0.55 + insight * 0.45) * baseMult), 35, 95);
    
    // Stamina and recovery
    const staminaEfficiency = clamp(1 - (endurance - 60) / 250, 0.65, 1.15);
    const coolRecoveryRate = clamp((resolve + endurance) / 400, 0.01, 0.08);
    
    // Skill and tactical
    const skillProc = clamp(Math.round((insight * 0.6 + resolve * 0.4) * baseMult), 35, 95);
    const tacticalInstinct = clamp(Math.round((insight * 0.7 + stride * 0.3) * baseMult), 35, 95);
    
    // Aggression and positioning
    const aggression = clamp(Math.round((force + stride) / 2 * baseMult), 35, 95);
    const zoneDecisionFactor = clamp(1 - (insight - 55) / 180, 0.55, 1.25);
    
    // Phase power (start, middle, final)
    const phasePower = {
      start: clamp(Math.round((stride * 0.7 + force * 0.3) * baseMult), 35, 95),
      middle: clamp(Math.round((endurance * 0.6 + paceControl * 0.4 / baseMult) * baseMult), 35, 95),
      final: clamp(Math.round((resolve * 0.6 + force * 0.4) * baseMult), 35, 95)
    };
    
    // Lane positioning preference
    let preferredLane = 'mid';
    if (passingPower >= 75) preferredLane = 'inside';
    else if (passingPower <= 55) preferredLane = 'outside';
    
    const positioning = {
      preferred: preferredLane,
      adaptability: clamp(Math.round((insight + resolve) / 2 * baseMult), 35, 95)
    };
    
    // Track adaptability (performs well in dirty/wet conditions)
    const trackAdaptability = clamp(Math.round((resolve * 0.5 + endurance * 0.35 + insight * 0.15) * baseMult), 35, 95);
    
    // Sprint-specific stats (explosive racing ability)
    const sprintPower = clamp(Math.round((stride * 0.5 + force * 0.35 + aggression * 0.15) * baseMult), 35, 95);
    const sprintEfficiency = clamp(Math.round((endurance * 0.4 + paceControl * 0.35 + resolve * 0.25) * baseMult), 35, 95);
    const burstFrequency = clamp(Math.round((insight * 0.6 + aggression * 0.4) * baseMult), 35, 95);
    
    // Enhanced stamina recovery (more impactful than coolRecoveryRate)
    const staminaRecovery = clamp(Math.round((endurance * 0.5 + resolve * 0.3 + paceControl * 0.2) * baseMult), 35, 95);
    
    // Surface-specific performance
    const surfacePerformance = {
      dry: clamp(Math.round((stride * 0.6 + insight * 0.4) * baseMult), 35, 95),
      wet: clamp(Math.round((endurance * 0.5 + resolve * 0.3 + trackAdaptability * 0.2) * baseMult), 35, 95),
      muddy: clamp(Math.round((resolve * 0.5 + endurance * 0.4 + force * 0.1) * baseMult), 35, 95)
    };
    
    return {
      maneuverBase,
      passingPower,
      fatigueResistance,
      paceControl,
      staminaEfficiency,
      coolRecoveryRate,
      skillProc,
      tacticalInstinct,
      aggression,
      zoneDecisionFactor,
      phasePower,
      positioning,
      trackAdaptability,
      sprintPower,
      sprintEfficiency,
      burstFrequency,
      staminaRecovery,
      surfacePerformance
    };
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
    derivePerformance,
    deriveAptitudes,
    buildRacingProfile,
    deriveSecondaryStats
  };
})();
