# 🎮 Balance & Mechanics TODO for Tomorrow

## ✅ **What's Already Implemented (Single Player):**

### **Stamina Mechanics:**
- ✅ Base drain based on speed/intensity
- ✅ Final sprint (+8% speed, costs 15 stamina)
- ✅ Overtaking costs 6-10 stamina (success) or 4-8 (fail)
- ✅ Slipstream recovery (behind other horses)
- ✅ Coast recovery (when going slow)
- ✅ coolRecoveryRate from secondary stats

### **Strategic Elements:**
- ✅ Racing styles have phase bonuses
- ✅ Lane positioning (inside/mid/outer)
- ✅ Overtaking with pass/block mechanics
- ✅ Skills trigger based on phase

---

## ⚠️ **Current Issues:**

### **1. Stamina Bar Barely Moves**
- **Problem:** Drain multiplier might be correct but visual doesn't update enough
- **Root cause:** Need to check if 2.8x drain is actually being applied
- **Fix:** Verify drain calculation, possibly increase to 4.0-5.0x

### **2. One Clear Winner (No Close Races)**
- **Problem:** High speed stat dominates everything
- **Root cause:** Speed is TOO influential (65% stride + 35% force)
- **Fix:** Reduce speed impact, increase skill/strategy impact

### **3. Skills Not Visible Enough**
- **Problem:** Skill toast only shows 2.5s, no other indicators
- **Fix:** Add visual effects:
  - Glowing aura around horse when skill active
  - Larger skill name display
  - Speed trail effect
  - Console logging (already added)

---

## 🔧 **Fixes Needed Tomorrow:**

### **Priority 1: Make Stamina Drain Visible**

```javascript
// Increase base drain even more
const staminaDrain = Math.max(0.05, (0.25 + stats.stride / 200 - stats.endurance / 300) * 5.0);

// OR adjust the formula itself to drain faster:
const maintainCost = racer.baseDrain * intensity * factors * dt * 1.5; // 1.5x multiplier
```

**Goal:** Horses should visibly lose stamina every second. Finish with 0-20%.

---

### **Priority 2: Balance for Close Races**

**Current Problem:**
- Speed stat too important (92 speed always wins)
- Skills not impactful enough to close gap
- No comeback potential

**Solution:**
1. **Reduce speed dominance:**
   ```javascript
   // OLD: baseSpeed = 3.2 + speed * 0.05 (max ~7.8)
   // NEW: baseSpeed = 4.0 + speed * 0.03 (max ~6.7)
   // Narrows the gap between fast and slow horses
   ```

2. **Increase skill impact further:**
   ```javascript
   // Skills: 2.5x boost (not 2.2x)
   // Duration: 2.0x (not 1.8x)
   // A good skill can add 10-15 seconds advantage!
   ```

3. **Add variance to prevent same winner:**
   ```javascript
   // Random start position bonus (-2 to +2 seconds)
   // Mood affects consistency (low mood = more variance)
   // Lane choice matters more (inside track bonus)
   ```

---

### **Priority 3: Strategic Stamina Use**

**Implement for racing styles:**

**Leader:**
```javascript
if (style === 'Leader' && rank === 1) {
  staminaDrain *= 0.7; // Save 30% stamina when leading!
}
```

**Pacer:**
```javascript
if (style === 'Pacer' && staminaRatio > 0.4 && staminaRatio < 0.8) {
  speedBonus += 0.05; // +5% speed when managing stamina well
}
```

**Chaser:**
```javascript
if (style === 'Chaser' && progress > 0.7 && rank > 2) {
  staminaDrain *= 1.3; // Burn stamina for final push!
  speedBonus += 0.15; // +15% speed in final stretch when behind
}
```

---

### **Priority 4: Make Skills Mood/Stamina Dependent**

```javascript
// Current:
chance = 0.28 + insight * 0.002 + (skillProc - 60) / 140

// NEW:
const moodBonus = (mood - 70) / 100; // High mood = more skills
const staminaBonus = staminaRatio > 0.6 ? 0.1 : -0.1; // Need stamina to use skills!
chance = 0.28 + insight * 0.002 + (skillProc - 60) / 140 + moodBonus + staminaBonus
```

**Result:** Low stamina or bad mood = less skill activations

---

### **Priority 5: Visual Skill Indicators**

Add to canvas draw:
```javascript
if (racer.skills.some(s => s.active)) {
  // Draw glowing aura
  ctx.shadowBlur = 20;
  ctx.shadowColor = racer.color;
  
  // Draw skill name above horse
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(activeSkill.name, x, y - 30);
}
```

---

## 📊 **Target Balance Goals:**

### **Finish Line Stats:**
- 🥇 1st place: 85-100s, 0-10% stamina
- 🥈 2nd place: 87-102s, 5-15% stamina (within 2-5 seconds!)
- 🥉 3rd place: 90-105s, 10-20% stamina
- 4️⃣ 4th place: 92-110s, 15-25% stamina

### **Win Distribution (100 races):**
- Speed build: 25-30% wins
- Endurance build: 20-25% wins  
- Skill build: 25-30% wins
- Balanced build: 20-25% wins

**No single build > 35% wins!**

---

## 🎯 **Summary:**

**The Philosophy:**
- Stamina = strategic resource to SPEND
- Better management = more overtakes, more speed boosts
- Skills = tactical moments that cost stamina
- Racing style = determines WHEN you spend stamina
- Close finishes = exciting races!

**Not just about having high stats, but USING them strategically!**

---

**This is for tomorrow!** All saved for now.
