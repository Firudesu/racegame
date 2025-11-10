# 🎯 Secondary Stats → Sprint & Recovery Integration Plan

## 📊 **Current Secondary Stats:**

### **Existing Stats (Already Calculated):**
1. **maneuverBase** (30-98) - Force 40% + Insight 60%
2. **passingPower** (35-98) - Maneuver 70% + Insight 50%
3. **fatigueResistance** (35-95) - Resolve 60% + Endurance 40%
4. **paceControl** (35-95) - Endurance 55% + Insight 45%
5. **staminaEfficiency** (0.65-1.15) - Endurance-based drain modifier
6. **coolRecoveryRate** (0.01-0.08) - (Resolve + Endurance) / 400
7. **skillProc** (35-95) - Insight 60% + Resolve 40%
8. **tacticalInstinct** (35-95) - Insight 70% + Stride 30%
9. **aggression** (35-95) - (Force + Stride) / 2
10. **trackAdaptability** (35-95) - Resolve 50% + Endurance 35% + Insight 15%
11. **phasePower** - { start, middle, final } (35-95 each)
12. **positioning** - { preferred: lane, adaptability }

---

## 🚀 **NEW SPRINT-RELATED STATS:**

### **1. sprintPower** (35-95) — How Much Speed Boost
**Formula:** `(Stride * 0.5 + Force * 0.35 + Aggression * 0.15)`
**Effect:** 
- Low (40): +20% sprint speed
- Medium (60): +25% sprint speed
- High (85): +32% sprint speed

**Why:** High stride + force = explosive sprinting!

---

### **2. sprintEfficiency** (35-95) — Lower Sprint Stamina Cost
**Formula:** `(Endurance * 0.4 + PaceControl * 0.35 + Resolve * 0.25)`
**Effect:**
- Low (40): 2.8x stamina drain while sprinting
- Medium (60): 2.5x stamina drain
- High (85): 2.0x stamina drain (20% less cost!)

**Why:** Good endurance + pace control = efficient sprinting!

---

### **3. surfacePerformance** (35-95 for each) — Performance by Track Type
**Formula:** 
- **Dry/Clean:** `(Stride * 0.6 + Insight * 0.4)`
- **Wet/Rainy:** `(Endurance * 0.5 + Resolve * 0.3 + TrackAdaptability * 0.2)`
- **Muddy:** `(Resolve * 0.5 + Endurance * 0.4 + Force * 0.1)`

**Effect:**
- High dry performance (85): +8% speed on clean tracks
- High wet performance (80): Only -2% speed on rainy (instead of -6%)
- High muddy performance (75): Only -4% speed on muddy (instead of -12%)

**Why:** Different horses excel on different surfaces!

---

### **4. staminaRecovery** (35-95) — Passive Stamina Regeneration
**Formula:** `(Endurance * 0.5 + Resolve * 0.3 + PaceControl * 0.2)`
**Effect:**
- Low (40): +0.05 stamina/second when coasting
- Medium (60): +0.12 stamina/second (current baseline)
- High (85): +0.22 stamina/second (87% faster recovery!)

**Why:** Better endurance + resolve = faster energy recovery!

---

### **5. burstFrequency** (35-95) — Sprint Cooldown Reduction
**Formula:** `(Insight * 0.6 + Aggression * 0.4)`
**Effect:**
- Low (40): 9 second cooldown between sprints
- Medium (60): 8 second cooldown
- High (85): 6.5 second cooldown (19% faster!)

**Why:** High insight + aggression = more frequent sprint opportunities!

---

## 🎯 **How They Map to Existing Stats:**

### **Already Partially Working:**
✅ **coolRecoveryRate** → Already affects stamina recovery  
✅ **trackAdaptability** → Already affects track condition penalties  
✅ **aggression** → Already used in sprint decisions  
✅ **paceControl** → Already affects stamina efficiency  

### **Need to Add:**
❌ **sprintPower** — NEW (affects sprint speed boost)  
❌ **sprintEfficiency** — NEW (affects sprint cost)  
❌ **surfacePerformance** — NEW (separate dry/wet/muddy ratings)  
❌ **staminaRecovery** — ENHANCE (make it more impactful)  
❌ **burstFrequency** — NEW (affects sprint cooldown)  

---

## 📈 **Implementation:**

### **1. Add to deriveSecondaryStats():**
```javascript
// Sprint-specific stats
const sprintPower = clamp(Math.round(
  (stride * 0.5 + force * 0.35 + aggression * 0.15) * baseMult
), 35, 95);

const sprintEfficiency = clamp(Math.round(
  (endurance * 0.4 + paceControl * 0.35 + resolve * 0.25) * baseMult
), 35, 95);

const burstFrequency = clamp(Math.round(
  (insight * 0.6 + aggression * 0.4) * baseMult
), 35, 95);

const staminaRecovery = clamp(Math.round(
  (endurance * 0.5 + resolve * 0.3 + paceControl * 0.2) * baseMult
), 35, 95);

// Surface performance
const surfacePerformance = {
  dry: clamp(Math.round((stride * 0.6 + insight * 0.4) * baseMult), 35, 95),
  wet: clamp(Math.round((endurance * 0.5 + resolve * 0.3 + trackAdaptability * 0.2) * baseMult), 35, 95),
  muddy: clamp(Math.round((resolve * 0.5 + endurance * 0.4 + force * 0.1) * baseMult), 35, 95)
};
```

### **2. Apply in stepRacer():**
```javascript
// Sprint multiplier based on sprintPower
const sprintPowerRating = racer.secondary?.sprintPower || 60;
const sprintBoost = 1.15 + (sprintPowerRating - 60) / 200; // 1.075 to 1.275
sprintMultiplier = sprintBoost; // Instead of fixed 1.25

// Sprint drain based on sprintEfficiency
const sprintEffRating = racer.secondary?.sprintEfficiency || 60;
const sprintCost = 2.8 - (sprintEffRating - 60) / 125; // 2.0 to 2.96
sprintDrainMultiplier = sprintCost; // Instead of fixed 2.5

// Stamina recovery based on staminaRecovery stat
const recoveryRating = racer.secondary?.staminaRecovery || 60;
const recoveryRate = 0.05 + (recoveryRating - 35) / 250; // 0.07 to 0.29
// Apply when coasting

// Sprint cooldown based on burstFrequency
const burstFreqRating = racer.secondary?.burstFrequency || 60;
const cooldown = 9.0 - (burstFreqRating - 35) / 25; // 6.6s to 9.0s
```

---

## 🌦️ **Surface Performance Effects:**

### **Clean/Dry Track:**
```javascript
const dryPerformance = racer.secondary?.surfacePerformance?.dry || 60;
if (isCleanTrack) {
  const dryBonus = 1 + (dryPerformance - 60) / 400; // 0.9375 to 1.0625
  targetSpeed *= dryBonus; // +6% at rating 85
}
```

### **Rainy Track:**
```javascript
const wetPerformance = racer.secondary?.surfacePerformance?.wet || 60;
const wetPenalty = trackConditions.speedModifier; // e.g., 0.94
const adjustedWetPenalty = 1 - ((1 - wetPenalty) * (1 - (wetPerformance - 40) / 150));
// High wet (85): Only -2% speed (instead of -6%)
// Low wet (40): Full -6% speed
```

### **Muddy Track:**
```javascript
const muddyPerformance = racer.secondary?.surfacePerformance?.muddy || 60;
// Similar reduction logic
// High muddy (80): Only -4% speed (instead of -12%)
```

---

## 📊 **Display in UI:**

### **Racing Profile (Enhanced):**
```
━━━ Racing Profile ━━━
🏁 Best Distance: Mid-Distance (1200m)
🌱 Prefers: Grass Tracks
🌦️ Track Adaptability: 72

━━━ Sprint Ability ━━━
🚀 Sprint Power: 78 (High burst speed!)
⚡ Sprint Efficiency: 65 (Moderate stamina cost)
🔄 Burst Frequency: 68 (7.2s cooldown)

━━━ Surface Performance ━━━
☀️ Dry Track: 82 (+5.5% speed bonus)
🌧️ Wet Track: 58 (-4% speed in rain)
💧 Muddy Track: 48 (-8% speed in mud)

━━━ Core Stats ━━━
⚡ Passing Power: 68
🎯 Pace Control: 81
💪 Fatigue Resistance: 63
🔋 Stamina Recovery: 72 (+0.20/s)
```

---

## 🎮 **Gameplay Impact:**

### **Sprint Specialist Horse:**
- **High sprintPower (85):** +32% speed per sprint (vs +25% average)
- **High sprintEfficiency (80):** 2.1x drain (vs 2.5x average)
- **High burstFrequency (82):** 6.8s cooldown (vs 8s average)
- **Result:** Can sprint 4-5 times, massive speed boosts, manageable cost!

### **Mud Runner Horse:**
- **High muddy performance (88):** Only -3% speed on muddy track
- **High trackAdaptability (85):** Sprint even in mud
- **High staminaRecovery (80):** Recover 0.24/s between sprints
- **Result:** Dominates muddy race days!

### **Balanced Horse:**
- Medium across all (60s) → Standard sprint performance
- 3 sprints per race, 8s cooldown, +25% speed, 2.5x drain

---

## ✅ **Should I Implement This?**

I'll add:
1. ✅ 5 new secondary stats (sprintPower, sprintEfficiency, burstFrequency, staminaRecovery, surfacePerformance)
2. ✅ Calculate them in deriveSecondaryStats()
3. ✅ Apply them in sprint system
4. ✅ Display them in Paddock UI
5. ✅ Console logs showing stat effects

**This will make long-term progression meaningful!** Legacy horses with high secondary stats will be MUCH better at tactical racing!

**Go ahead?** 🏇
