// Race Balance Test - Run 100 simulations and analyze results
// Run this in browser console after loading the game

function runRaceBalanceTest() {
  console.log('🧪 Starting 100 race simulation test...');
  
  const results = [];
  const Data = window.ProjectStrideData;
  
  if (!Data) {
    console.error('ProjectStrideData not loaded!');
    return;
  }
  
  // Create 4 test horses with different stat profiles
  const testHorses = [
    { name: 'Speed Demon', stats: { stride: 95, endurance: 60, force: 75, resolve: 55, insight: 60 }, skills: [{name: 'Rush Surge', trigger: 'final', boost: 0.22, duration: 4}], style: 'Sprinter' },
    { name: 'Endurance King', stats: { stride: 70, endurance: 95, force: 65, resolve: 85, insight: 70 }, skills: [{name: 'Steady Rhythm', trigger: 'middle', boost: 0.12, duration: 5}], style: 'Pacer' },
    { name: 'Balanced Pro', stats: { stride: 80, endurance: 80, force: 80, resolve: 75, insight: 80 }, skills: [{name: 'Iron Will', trigger: 'final', boost: 0.22, duration: 3.5}], style: 'Chaser' },
    { name: 'Skill Master', stats: { stride: 75, endurance: 70, force: 70, resolve: 70, insight: 95 }, skills: [{name: 'Early Burst', trigger: 'start', boost: 0.14, duration: 3}, {name: 'Rush Surge', trigger: 'final', boost: 0.22, duration: 4}], style: 'Leader' }
  ];
  
  for (let raceNum = 0; raceNum < 100; raceNum++) {
    const seed = Date.now() + raceNum * 1000;
    const rng = Data.createSeededRng(seed);
    
    // Simulate race (simplified)
    const raceResults = testHorses.map((horse, idx) => {
      const profile = Data.buildRacingProfile(horse.stats, {});
      const secondary = profile.secondary || {};
      
      // Base time from speed
      const speed = profile.performance.speed;
      const baseTime = 180 - speed;
      
      // Variance
      const variance = (rng() - 0.5) * 15;
      
      // Secondary bonuses
      const paceBonus = (secondary.paceControl - 60) / 15;
      const passBonus = (secondary.passingPower - 60) / 15;
      
      // Skill bonus (simplified)
      const skillBonus = horse.skills.length * 3;
      
      // Style bonus
      const styleBonus = horse.style === 'Sprinter' ? -2 : horse.style === 'Chaser' ? -1.5 : 0;
      
      const finalTime = baseTime + variance - paceBonus - passBonus - skillBonus + styleBonus;
      
      return {
        name: horse.name,
        time: finalTime,
        speed: speed,
        paceControl: secondary.paceControl,
        skillProc: secondary.skillProc
      };
    });
    
    raceResults.sort((a, b) => a.time - b.time);
    raceResults.forEach((r, i) => r.position = i + 1);
    
    results.push(raceResults);
  }
  
  // Analyze results
  console.log('\n📊 === RACE BALANCE ANALYSIS (100 races) ===\n');
  
  const winCounts = {};
  const positionCounts = {};
  const timeDiffs = [];
  
  results.forEach(race => {
    const winner = race[0];
    winCounts[winner.name] = (winCounts[winner.name] || 0) + 1;
    
    race.forEach(r => {
      if (!positionCounts[r.name]) positionCounts[r.name] = {1: 0, 2: 0, 3: 0, 4: 0};
      positionCounts[r.name][r.position]++;
    });
    
    // Time difference between 1st and 2nd
    const diff = race[1].time - race[0].time;
    timeDiffs.push(diff);
  });
  
  console.log('🏆 WIN COUNTS:');
  Object.entries(winCounts).forEach(([name, count]) => {
    console.log(`  ${name}: ${count} wins (${count}%)`);
  });
  
  console.log('\n📍 POSITION DISTRIBUTION:');
  Object.entries(positionCounts).forEach(([name, positions]) => {
    console.log(`  ${name}:`);
    console.log(`    1st: ${positions[1]}% | 2nd: ${positions[2]}% | 3rd: ${positions[3]}% | 4th: ${positions[4]}%`);
  });
  
  const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
  const minDiff = Math.min(...timeDiffs);
  const maxDiff = Math.max(...timeDiffs);
  
  console.log('\n⏱️ TIME DIFFERENCES (1st vs 2nd):');
  console.log(`  Average: ${avgDiff.toFixed(2)}s`);
  console.log(`  Min: ${minDiff.toFixed(2)}s`);
  console.log(`  Max: ${maxDiff.toFixed(2)}s`);
  
  console.log('\n💡 RECOMMENDATIONS:');
  const dominantWinner = Object.entries(winCounts).find(([_, count]) => count > 40);
  if (dominantWinner) {
    console.log(`  ⚠️ ${dominantWinner[0]} wins ${dominantWinner[1]}% - TOO DOMINANT!`);
    console.log('  → Reduce advantage or increase variance');
  }
  
  if (avgDiff > 8) {
    console.log(`  ⚠️ Average gap of ${avgDiff.toFixed(1)}s is too large`);
    console.log('  → Races not close enough, increase competition');
  } else if (avgDiff < 2) {
    console.log(`  ⚠️ Average gap of ${avgDiff.toFixed(1)}s is too small`);
    console.log('  → Races too random, stats don't matter enough');
  } else {
    console.log(`  ✅ Average gap of ${avgDiff.toFixed(1)}s is GOOD!`);
  }
  
  return { winCounts, positionCounts, avgDiff, results };
}

// Auto-run
const testResults = runRaceBalanceTest();
