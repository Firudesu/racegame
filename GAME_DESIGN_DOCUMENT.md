# Project Stride - Game Design Document

## Table of Contents
1. [Game Overview](#game-overview)
2. [Core Mechanics](#core-mechanics)
3. [Stats System](#stats-system)
4. [Racing System](#racing-system)
5. [Training System](#training-system)
6. [Skills System](#skills-system)
7. [Multiplayer Features](#multiplayer-features)
8. [NFT Integration](#nft-integration)
9. [Legacy System](#legacy-system)
10. [Technical Details](#technical-details)

---

## Game Overview

**Project Stride** is a browser-based horse racing simulation game that combines strategic training, tactical racing, and blockchain integration. Players manage their stable of horses, train them to improve stats, and compete in races against AI opponents or other players in multiplayer matches.

### Key Features
- **Training System**: Improve your horse's stats through focused training sessions
- **Tactical Racing**: Choose racing strategies and watch your horse compete in real-time
- **Multiplayer Racing**: Race against other players in asynchronous multiplayer matches
- **NFT Integration**: Import Dayjob Punks NFTs as racing horses
- **Legacy System**: Retired champions pass bonuses to future generations
- **Skills & Abilities**: Unlock powerful racing skills through training and racing

---

## Core Mechanics

### Game Flow
1. **Stride Estate (Main Menu)**: Central hub with access to all game areas
2. **Training Grounds**: Improve horse stats through training sessions
3. **Paddock**: Manage your stable of horses (up to 4 slots)
4. **Race Track**: Compete in solo or multiplayer races
5. **Retired Stable**: View your retired champions and their legacy

### Avatar System
- Each player has one active avatar (horse) at a time
- Avatars have unique names, stats, skills, and racing styles
- Avatars can be created from scratch or imported from NFTs
- Avatars accumulate training sessions and racing experience

---

## Stats System

### Primary Stats

All stats range from **0-100** and directly impact racing performance:

#### **Stride** (60 base)
- **Effect**: Base speed and acceleration
- **Racing Impact**: Determines top speed and initial burst
- **Training**: Improves sprint capability and early race positioning

#### **Endurance** (55 base)
- **Effect**: Stamina pool and recovery rate
- **Racing Impact**: How long the horse can maintain high speeds
- **Training**: Increases stamina efficiency and reduces fatigue

#### **Force** (48 base)
- **Effect**: Raw power and acceleration
- **Racing Impact**: Burst speed and passing ability
- **Training**: Enhances overtaking maneuvers and sprint power

#### **Resolve** (42 base)
- **Effect**: Mental toughness and consistency
- **Racing Impact**: Performance under pressure and final phase strength
- **Training**: Improves late-race performance and stamina conservation

#### **Insight** (50 base)
- **Effect**: Tactical awareness and decision-making
- **Racing Impact**: Better positioning, passing decisions, and skill activation
- **Training**: Enhances strategic racing and skill effectiveness

#### **Mood** (75 base)
- **Effect**: Overall performance modifier
- **Range**: 0-100
- **Impact**: Affects all stats indirectly
- **Changes**: Influenced by training, racing results, and legacy bonuses

### Secondary Stats (Derived)

These stats are automatically calculated from primary stats:

#### Performance Stats
- **Speed**: Derived from Stride (65%) + Force (35%)
- **Handling**: Derived from Resolve (45%) + Insight (55%)
- **Maneuver**: Derived from Force (40%) + Insight (60%)

#### Racing Profile Stats
- **Maneuver Base**: Lane changing and positioning ability
- **Passing Power**: Overtaking effectiveness
- **Fatigue Resistance**: How well the horse handles long races
- **Pace Control**: Ability to maintain consistent speed
- **Stamina Efficiency**: Energy consumption rate
- **Skill Proc**: Likelihood of skills activating
- **Tactical Instinct**: Strategic decision-making quality
- **Aggression**: Willingness to make risky moves

#### Phase Power
- **Start Phase**: Initial burst capability (Stride 70% + Force 30%)
- **Middle Phase**: Sustained pace (Endurance 60% + Pace Control 40%)
- **Final Phase**: Finishing kick (Resolve 60% + Force 40%)

#### Surface Performance
- **Dry Track**: Stride 60% + Insight 40%
- **Wet Track**: Endurance 50% + Resolve 30% + Track Adaptability 20%
- **Muddy Track**: Resolve 50% + Endurance 40% + Force 10%

#### Aptitudes
- **Distance Type**: Sprint, Mile, Medium, or Long (based on Stride + Endurance)
- **Surface Preference**: Firm, Balanced, or Wet (based on Resolve + Insight)
- **Phase Focus**: Start, Middle, or Final (strongest phase)
- **Lane Bias**: Inside, Mid, or Outside (based on Passing Power)

---

## Racing System

### Race Structure

#### Track Details
- **Length**: 1200 meters
- **Zones**: 3 lanes (Inside, Mid, Outside)
- **Sections**: 5 distinct sections (Straights and Turns)
  - Straight 1 (0-20%): Speed bonus +1.05, Overtake bonus +1.3
  - Turn 1 (20-35%): Speed penalty -4%, Handling matters
  - Straight 2 (35-65%): Speed bonus +1.06, Overtake bonus +1.4
  - Turn 2 (65-80%): Speed penalty -4%, Handling matters
  - Home Straight (80-100%): Speed bonus +1.08, Overtake bonus +1.5

#### Race Phases
1. **Start Phase** (0-25% of track)
   - High speed, aggressive positioning
   - Leader strategy gets +10% speed bonus
   - Skills: Early Burst, Mind Focus, Risk Push

2. **Middle Phase** (25-80% of track)
   - Stamina management critical
   - Pacer strategy gets +5% bonus
   - Skills: Steady Rhythm, Second Wind, Insight Flash

3. **Final Phase** (80-100% of track)
   - Maximum effort sprint
   - Chaser/Sprinter strategies excel
   - Skills: Rush Surge, Iron Will, Resolve Breaker, Late Surge

### Racing Strategies

Players choose a strategy before each race:

#### **Leader** 🏃
- **Start**: +10% speed bonus
- **Middle**: No bonus
- **Final**: -10% penalty
- **Maneuver**: -10% modifier
- **Best For**: Horses with high Stride and Force
- **Tactic**: Get ahead early, conserve stamina when leading

#### **Pacer** ⚖️
- **Start**: +5% bonus
- **Middle**: +5% bonus
- **Final**: -5% penalty
- **Maneuver**: No modifier
- **Best For**: Balanced horses with good Endurance
- **Tactic**: Steady pace throughout, optimal energy management

#### **Chaser** ⚡
- **Start**: -5% penalty
- **Middle**: +10% bonus
- **Final**: +5% bonus
- **Maneuver**: +10% modifier
- **Best For**: Horses with high Resolve and Endurance
- **Best For**: Save energy early, burst in final phase

#### **Sprinter** 🚀
- **Start**: -10% penalty
- **Middle**: No bonus
- **Final**: +15% bonus
- **Maneuver**: +15% modifier
- **Best For**: High Force and Resolve horses
- **Tactic**: All-out speed bursts, high stamina cost

### Track Conditions

Races feature dynamic track conditions that affect performance:

#### Track State
- **Clean**: No modifiers
- **Slightly Dirty**: -4% speed, +8% stamina drain
- **Muddy**: -12% speed, +20% stamina drain

#### Weather
- **Sunny**: No modifiers
- **Overcast**: No modifiers
- **Rainy**: -6% speed, +10% stamina drain

### Racing Mechanics

#### Stamina System
- Each horse starts with **650 stamina points**
- Stamina drains based on speed, maneuvers, and track conditions
- Low stamina reduces speed and prevents aggressive moves
- Skills can regenerate stamina or reduce drain

#### Passing System
- **Distance Threshold**: 24 meters to attempt pass
- **Cooldown**: 4-6 seconds between pass attempts
- **Success Cost**: 10-16 stamina
- **Failure Cost**: 18-25 stamina
- **Blocking**: Defensive horses can block passes (costs 2.5 stamina per tick)

#### Zone Positioning
- **Inside Track**: -24m radius, 0.99x distance multiplier (shorter path)
- **Mid Track**: 0m radius, 1.0x multiplier (standard)
- **Outside Track**: +24m radius, 1.01x multiplier (longer but faster)

#### Sprint Mode
- Horses can enter "sprint mode" in final phase
- Costs 15 stamina per second
- Provides significant speed boost
- Only available when stamina > 30%

### Race Results

After each race, players see:
- **Finish Position**: 1st, 2nd, 3rd, etc.
- **Finish Time**: Total race time in seconds
- **Final Stamina**: Percentage remaining
- **Skills Used**: List of activated skills
- **Performance Stats**: Speed, handling, stamina breakdown

---

## Training System

### Training Sessions

- **Sessions Available**: Starts with 5 sessions per avatar
- **Session Duration**: 3-5 seconds (randomized)
- **Stat Gain**: Base +8 points per session (modified by bonuses)
- **Training Types**: Stride, Endurance, Force, Resolve, Insight

### Training Mechanics

#### Base Gains
- Each training session increases the selected stat by **8 points** (base)
- Stats are capped at **100**
- Training bonuses can increase gains:
  - Legacy bonus: +12% gain
  - Standard bonus: +5% gain

#### Session Limits
- Each avatar has a limited number of training sessions
- Sessions are consumed when training
- Legacy horses start with bonus sessions

#### Training Log
- All training activities are logged with timestamps
- Shows stat improvements and gains
- Helps track training progress

### Training Tips
- Focus on stats that match your racing strategy
- Balance stats for well-rounded performance
- Consider your horse's aptitudes when training
- Legacy horses train more efficiently

---

## Skills System

### Skill Types

#### Active Skills
Triggered automatically during specific race phases:

**Start Phase Skills**
- **Early Burst** (Common): +14% speed for 3 seconds
- **Mind Focus** (Common): +10% speed for 4 seconds, calms nerves
- **Risk Push** (Epic): +28% speed for 2.2 seconds, reduced control

**Middle Phase Skills**
- **Steady Rhythm** (Common): +12% speed for 5 seconds
- **Second Wind** (Uncommon): +18% speed for 3 seconds, +5% stamina regen
- **Insight Flash** (Common): +16% speed for 3.5 seconds

**Final Phase Skills**
- **Rush Surge** (Common): +15% speed for 4 seconds
- **Iron Will** (Uncommon): +22% speed for 3.5 seconds
- **Resolve Breaker** (Uncommon): +20% speed for 4.5 seconds
- **Late Surge** (Rare): +18% speed for 3.5 seconds, stamina shield 60%
- **Boost** (Rare): +22% speed for 2.8 seconds

#### Passive Skills
Always active, provide constant bonuses:

- **Predict Move** (Rare): Anticipates traffic, +5% insight bonus
- **Steady Focus** (Uncommon): Reduces stamina drain by 15%, calmer racing
- **Overtake** (Uncommon): +12% passing bonus
- **Slipstream** (Common): +7% boost when following closely
- **Defend Line** (Uncommon): +30% defense against passes
- **Recovery** (Uncommon): 40% faster recovery after slowdowns
- **Adaptive Drive** (Rare): +8% overall performance adjustment
- **Precision Drive** (Uncommon): +4% handling, smoother racing
- **Fatigue Drop** (Rare): -15% endurance drain over time
- **Block Attempt** (Uncommon): Attempts to block passes from behind
- **Predictive Overtake** (Rare): Starts passes earlier, +8% pass bonus
- **Cool Recovery** (Uncommon): Recovers stamina at low speeds

### Skill Acquisition

- Skills are randomly awarded during training and racing
- Higher rarity skills are less common
- Legacy horses have +12% skill chance bonus
- Standard horses have +5% skill chance bonus
- Skills are weighted by rarity (Common > Uncommon > Rare > Epic)

### Skill Rarity

1. **Common** (Rarity 1): Most common, basic bonuses
2. **Uncommon** (Rarity 2): Moderate bonuses, balanced effects
3. **Rare** (Rarity 3): Strong bonuses, significant impact
4. **Epic** (Rarity 4): Powerful bonuses, game-changing effects

---

## Multiplayer Features

### Matchmaking System

#### Queue System
- Players join a race queue by clicking "Multiplayer Race"
- Queue matches players automatically when 2+ players are waiting
- Matches are created asynchronously (no real-time waiting required)
- Race results are stored and viewable when players return

#### Race Simulation
- Multiplayer races include **2 players + 2 AI opponents** (4 total)
- Uses the same racing engine as solo races
- Full race replay is captured and stored
- Results are saved to database for both players

### Race Replay System

- **Visual Replay**: Full race animation replayable at any time
- **Frame Capture**: Race state captured every 0.1 seconds (10fps)
- **Commentary**: Dynamic race commentary during replay
- **Results Modal**: Detailed results with positions, times, and stats

### Multiplayer Features

- **Asynchronous Racing**: No need to wait for opponent
- **Race History**: View all your multiplayer race results
- **Unviewed Races**: Notification when race results are available
- **Player Profiles**: Track wins, losses, and statistics

---

## NFT Integration

### Supported Collections

- **Dayjob Punks**: Contract address `0xa8d334c9cf7fc57eba51bf4d98bd880cb16a0de8`
- NFTs are imported via MetaMask wallet connection
- NFT images and metadata are used for horse appearance

### NFT Import Process

1. Connect MetaMask wallet
2. Click "Import from Wallet" in Paddock
3. Available NFTs are automatically detected
4. Select NFT to import as racing horse
5. NFT gets randomized stats (slightly higher than stable horses)

### NFT Benefits

- **Higher Base Stats**: NFTs start with 60-80 in stats (vs 50-70 for stable horses)
- **Unique Appearance**: Uses NFT image as horse portrait
- **Token ID**: Preserved for identification
- **Collection Tag**: Shows "DayJobPunks" collection

### Stable Horses

- Can create up to 4 horses total (NFTs + Stable horses)
- Stable horses use default horse image
- Stats randomized between 50-70
- Fully functional for racing and training

---

## Legacy System

### Retiring Champions

- Players can retire their avatar/horse at any time
- Retired horses are moved to "Retired Stable"
- Retired horses cannot race or train
- Retired horses pass bonuses to future generations

### Legacy Bonuses

When creating a new avatar from a legacy horse:

- **Stat Inheritance**: New horse gets average of base stats + legacy stats (capped 35-80)
- **Training Bonus**: +12% training effectiveness (vs +5% standard)
- **Skill Chance**: +12% chance to learn skills (vs +5% standard)
- **Legendary Luck**: +25% rare skill chance (vs +8% standard)
- **Secondary Bonus**: +20% secondary stat bonuses (vs +8% standard)
- **Mood Boost**: Starts at 85 mood (vs 75 standard)

### Legacy Gallery

- View all retired champions
- See their final stats and achievements
- Select legacy horse when creating new avatar
- Legacy flag displayed on boosted avatars

---

## Technical Details

### Game Architecture

- **Frontend**: Vanilla JavaScript (ES6+)
- **Backend**: Supabase (PostgreSQL database)
- **Blockchain**: Ethereum (MetaMask integration)
- **Storage**: LocalStorage for client-side data, Supabase for multiplayer

### Data Storage

#### Local Storage
- Avatar data (stats, skills, training sessions)
- Legacy records
- Token ID
- Wallet address
- Roster of horses

#### Supabase Database
- Player profiles
- Horse records
- Race queue entries
- Race results and replays
- Race participants

### Performance

- **Race Simulation**: 20 steps per second (50ms per step)
- **Frame Capture**: Every 2 steps (10fps replay)
- **Max Race Time**: 5 minutes (safety limit)
- **Canvas Rendering**: 900x500px, device pixel ratio aware

### Browser Compatibility

- Modern browsers with ES6+ support
- Canvas API for race visualization
- LocalStorage API for data persistence
- MetaMask extension for wallet connection

---

## Game Balance

### Stat Ranges
- **Base Stats**: 35-95 (AI opponents)
- **Player Base**: 42-60 (starting range)
- **Max Stats**: 100 (hard cap)
- **Training Gain**: 8 base points per session

### Racing Balance
- **Stamina Costs**: Passing is expensive (10-25 stamina)
- **Zone Differences**: Small but meaningful (1-2% distance difference)
- **Strategy Bonuses**: 5-15% modifiers (significant but not overpowered)
- **Skill Activation**: Based on Insight stat and rarity

### Progression
- **Training Sessions**: Limited resource (5 starting sessions)
- **Skill Acquisition**: Random but weighted by rarity
- **Legacy System**: Rewards long-term play and retirement
- **Multiplayer**: Same mechanics as solo (fair competition)

---

## Future Features (Potential)

- **Tournaments**: Scheduled racing events with prizes
- **Breeding System**: Combine two horses to create offspring
- **Equipment**: Gear that modifies stats
- **Achievements**: Unlock rewards for milestones
- **Leaderboards**: Global rankings and statistics
- **Custom Tracks**: Player-created race courses
- **Team Racing**: Form teams and compete together

---

## Credits & Notes

**Project Stride** combines strategic management with exciting racing action. The game emphasizes:
- **Strategy**: Choose training focus and racing tactics wisely
- **Progression**: Build your stable and improve your horses
- **Competition**: Race against AI and other players
- **Legacy**: Create champions that benefit future generations

For questions, feedback, or contributions, please refer to the project repository.

---

*Last Updated: 2024*
*Version: 3.0*
