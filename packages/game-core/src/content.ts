import type {
  CampaignNodeDefinition,
  EnemyDefinition,
  LevelDefinition,
  ModifierDefinition,
  RewardDefinition,
  SpawnDefinition,
  TowerDefinition,
} from "./types.js";

function group(
  enemyId: string,
  count: number,
  everyTicks: number,
  startTick = 0,
): SpawnDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    enemyId,
    atTick: startTick + index * everyTicks,
  }));
}

function wave(
  ...groups: readonly (readonly SpawnDefinition[])[]
): readonly SpawnDefinition[] {
  return groups.flat().sort((left, right) => left.atTick - right.atTick);
}

function pacedWave(
  timelinePercent: number,
  ...groups: readonly (readonly SpawnDefinition[])[]
): readonly SpawnDefinition[] {
  return wave(...groups).map((spawn) => ({
    ...spawn,
    atTick: Math.floor((spawn.atTick * timelinePercent) / 100),
  }));
}

export const towerDefinitions = {
  "fork-knight": {
    id: "fork-knight",
    name: "Sir Stabs-a-Lot",
    shortName: "Fork Knight",
    description:
      "A brave utensil with excellent table manners and short reach.",
    color: 0xf7d774,
    cost: 57,
    damageType: "physical",
    splashRadius: 0,
    slowPercent: 0,
    slowTicks: 0,
    supportCooldownPercent: 0,
    baseMaxLevel: 3,
    levels: [
      { damage: 24, range: 126, cooldownTicks: 16, upgradeCost: 52 },
      { damage: 38, range: 138, cooldownTicks: 14, upgradeCost: 85 },
      { damage: 58, range: 152, cooldownTicks: 12, upgradeCost: 140 },
      {
        damage: 58,
        range: 152,
        cooldownTicks: 12,
        upgradeCost: null,
        pierceCount: 1,
      },
    ],
  },
  "discount-wizard": {
    id: "discount-wizard",
    name: "Merl-ish",
    shortName: "Discount Wizard",
    description: "Licensed in three counties. Fireballs may contain glitter.",
    color: 0xc28dff,
    cost: 95,
    damageType: "arcane",
    splashRadius: 54,
    slowPercent: 0,
    slowTicks: 0,
    supportCooldownPercent: 0,
    baseMaxLevel: 3,
    levels: [
      { damage: 27, range: 156, cooldownTicks: 34, upgradeCost: 76 },
      { damage: 43, range: 169, cooldownTicks: 31, upgradeCost: 119 },
      { damage: 68, range: 184, cooldownTicks: 27, upgradeCost: null },
    ],
  },
  bardbarian: {
    id: "bardbarian",
    name: "Conan the Contralto",
    shortName: "Bardbarian",
    description: "Hits one note, several enemies, and every ally's tempo.",
    color: 0x65e6c4,
    cost: 85,
    damageType: "sonic",
    splashRadius: 42,
    slowPercent: 35,
    slowTicks: 60,
    supportCooldownPercent: 20,
    baseMaxLevel: 3,
    levels: [
      { damage: 32, range: 136, cooldownTicks: 40, upgradeCost: 66 },
      { damage: 48, range: 149, cooldownTicks: 36, upgradeCost: 105 },
      { damage: 68, range: 164, cooldownTicks: 32, upgradeCost: null },
    ],
  },
} as const satisfies Record<string, TowerDefinition>;

export const enemyDefinitions = {
  "basic-goblin": {
    id: "basic-goblin",
    name: "Entry-Level Goblin",
    description: "Still in probation. Extremely motivated by dental coverage.",
    color: 0x8dd657,
    maxHealth: 70,
    speed: 58,
    armor: 0,
    reward: 1,
    lifeDamage: 1,
    boss: false,
  },
  "fast-mimic": {
    id: "fast-mimic",
    name: "Express Mimic",
    description: "A treasure chest with same-day delivery and too many teeth.",
    color: 0xe9a94a,
    maxHealth: 95,
    speed: 91,
    armor: 1,
    reward: 2,
    lifeDamage: 1,
    boss: false,
  },
  "tax-troll": {
    id: "tax-troll",
    name: "Armored Tax Troll",
    description: "Audits damage receipts and deducts most physical enthusiasm.",
    color: 0x7891a7,
    maxHealth: 245,
    speed: 37,
    armor: 8,
    reward: 4,
    lifeDamage: 2,
    boss: false,
  },
  "dragon-intern": {
    id: "dragon-intern",
    name: "Unionized Dragon Intern",
    description:
      "Unpaid, overqualified, and contractually entitled to a rage phase.",
    color: 0xf06d5f,
    maxHealth: 1_180,
    speed: 31,
    armor: 6,
    reward: 50,
    lifeDamage: 5,
    boss: true,
    bossPhase: {
      healthThresholdPercent: 50,
      speedMultiplierPercent: 155,
    },
  },
  "coupon-squire": {
    id: "coupon-squire",
    name: "Coupon Squire",
    description:
      "Carries a shield made of expired coupons. The first swing always misses the fine print.",
    color: 0xf2d24b,
    maxHealth: 130,
    speed: 50,
    armor: 2,
    reward: 2,
    lifeDamage: 1,
    boss: false,
    traits: [{ kind: "first-hit-ward" }],
  },
  "queue-jumper": {
    id: "queue-jumper",
    name: "Queue Jumper",
    description:
      "Cuts every line and shrugs off anything that dares slow it down.",
    color: 0x59c3e6,
    maxHealth: 85,
    speed: 105,
    armor: 1,
    reward: 2,
    lifeDamage: 1,
    boss: false,
    traits: [{ kind: "slow-immune" }],
  },
  "bog-guard": {
    id: "bog-guard",
    name: "Bog Guard",
    description: "Sworn to escort the Baron and to never, ever wipe its boots.",
    color: 0x6b7d5e,
    maxHealth: 150,
    speed: 60,
    armor: 3,
    reward: 3,
    lifeDamage: 2,
    boss: false,
    traits: [{ kind: "first-hit-ward" }],
  },
  "baron-von-bog": {
    id: "baron-von-bog",
    name: "Baron von Bog",
    description:
      "Self-appointed royalty of the moat. Calls for backup the moment things get soggy.",
    color: 0x8a4fae,
    maxHealth: 1_600,
    speed: 33,
    armor: 7,
    reward: 70,
    lifeDamage: 6,
    boss: true,
    bossPhase: {
      healthThresholdPercent: 50,
      speedMultiplierPercent: 170,
      escort: { enemyId: "bog-guard", count: 2 },
    },
  },
} as const satisfies Record<string, EnemyDefinition>;

export const modifierDefinitions = {
  "stingy-king": {
    id: "stingy-king",
    name: "The Stingy King's Budget",
    description: "Begin with 40 less gold and make every early fork count.",
    startingGoldDelta: -40,
    enemyHealthPercent: 100,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 0,
  },
  "sale-rush": {
    id: "sale-rush",
    name: "Sale Rush",
    description:
      "Word of a sale spread fast: shoppers arrive 15% sooner, begin with 25 less gold, and enjoy a 5% wellness bonus.",
    startingGoldDelta: -25,
    enemyHealthPercent: 105,
    spawnIntervalPercent: 85,
    padShutdownExtraTicks: 0,
  },
  roadworks: {
    id: "roadworks",
    name: "Roadworks",
    description:
      "Scheduled toll booth closures run 40 ticks longer than posted.",
    startingGoldDelta: 0,
    enemyHealthPercent: 100,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 40,
  },
} as const satisfies Record<string, ModifierDefinition>;

export const rewardDefinitions = {
  "fork-table-service": {
    kind: "tower-rank",
    id: "fork-table-service",
    name: "Table Service",
    description:
      "Fork Knight rank IV: strikes now pierce through to a second target.",
    towerId: "fork-knight",
    unlockedLevel: 4,
  },
  "emergency-tea-break": {
    kind: "ability",
    id: "emergency-tea-break",
    name: "Emergency Tea Break",
    description:
      "Active ability: once per wave, slow every non-boss enemy for 4 seconds.",
    abilityId: "emergency-tea-break",
  },
} as const satisfies Record<string, RewardDefinition>;

export const muddyMoatLevel: LevelDefinition = {
  id: "muddy-moat",
  name: "The Muddy Moat",
  subtitle: "An aggressively damp tutorial in six regrettable acts.",
  act: 1,
  order: 1,
  estimatedMinutes: 12,
  threatSummary:
    "Goblin filler, sprinting mimics, armored tax trolls, and a rage-phase dragon intern boss.",
  mechanicSummary:
    "Tutorial pacing: no restrictions, just economy, splash, and slow fundamentals.",
  environment: {
    theme: "murky-swamp",
    decorIds: ["reeds", "toadstools", "lily-pads"],
    palette: { primary: 0x2f6b4f, secondary: 0x1d3f30, accent: 0xd8c37a },
  },
  width: 960,
  height: 540,
  startingLives: 12,
  startingGold: 270,
  path: [
    { x: -36, y: 158 },
    { x: 148, y: 158 },
    { x: 148, y: 354 },
    { x: 378, y: 354 },
    { x: 378, y: 128 },
    { x: 612, y: 128 },
    { x: 612, y: 391 },
    { x: 996, y: 391 },
  ],
  pads: [
    { id: "bramble-seat", position: { x: 83, y: 74 } },
    { id: "puddle-perch", position: { x: 245, y: 250 } },
    { id: "mushroom-box", position: { x: 285, y: 448 } },
    { id: "crooked-stool", position: { x: 472, y: 249 } },
    { id: "soggy-plinth", position: { x: 520, y: 55 } },
    { id: "turnip-stage", position: { x: 713, y: 270 } },
    { id: "bucket-throne", position: { x: 782, y: 474 } },
    { id: "gate-crate", position: { x: 858, y: 300 } },
  ],
  waves: [
    {
      name: "Orientation Day",
      preview:
        "Three drill companies arrive in sequence: a steady line, a tighter file, then a final crowd.",
      spawns: wave(
        group("basic-goblin", 30, 18),
        group("basic-goblin", 26, 16, 440),
        group("basic-goblin", 30, 14, 780),
      ),
    },
    {
      name: "Chest Day",
      preview:
        "Goblin files screen two mimic sprints before a packed closing formation.",
      spawns: wave(
        group("basic-goblin", 24, 18),
        group("fast-mimic", 8, 42, 180),
        group("basic-goblin", 28, 16, 450),
        group("fast-mimic", 10, 36, 750),
        group("basic-goblin", 26, 14, 1_050),
      ),
    },
    {
      name: "Fiscal Friction",
      preview:
        "Armored auditors anchor three infantry phases while mimics probe the gaps.",
      spawns: wave(
        group("basic-goblin", 28, 18),
        group("tax-troll", 5, 100, 220),
        group("basic-goblin", 30, 15, 520),
        group("tax-troll", 6, 90, 850),
        group("fast-mimic", 12, 28, 1_100),
        group("basic-goblin", 20, 14, 1_380),
      ),
    },
    {
      name: "Prime Delivery",
      preview:
        "Alternating express parcels and troll roadblocks force repeated target-priority changes.",
      spawns: wave(
        group("fast-mimic", 18, 24),
        group("basic-goblin", 26, 15, 300),
        group("tax-troll", 6, 90, 620),
        group("fast-mimic", 20, 22, 900),
        group("basic-goblin", 28, 13, 1_250),
        group("tax-troll", 5, 80, 1_500),
      ),
    },
    {
      name: "Mandatory Fun",
      preview:
        "Five mixed teams rotate from crowds to armor to a final all-departments surge.",
      spawns: wave(
        group("basic-goblin", 32, 14),
        group("fast-mimic", 14, 28, 250),
        group("tax-troll", 7, 85, 600),
        group("basic-goblin", 34, 13, 950),
        group("fast-mimic", 18, 24, 1_250),
        group("tax-troll", 7, 75, 1_520),
      ),
    },
    {
      name: "Exit Interview",
      preview:
        "The intern advances behind references, changes pace at half health, then faces a final mimic rush.",
      spawns: wave(
        group("basic-goblin", 34, 14),
        group("tax-troll", 8, 80, 300),
        group("fast-mimic", 18, 24, 700),
        group("dragon-intern", 1, 1, 1_050),
        group("basic-goblin", 32, 13, 1_080),
        group("tax-troll", 7, 75, 1_450),
        group("fast-mimic", 24, 22, 1_680),
        group("basic-goblin", 12, 14, 2_150),
      ),
    },
  ],
  mastery: [
    {
      id: "dry-socks",
      name: "Dry Socks",
      description: "Win without leaking an enemy.",
      rule: { kind: "no-leaks" },
    },
    {
      id: "balanced-party",
      name: "Balanced-ish Party",
      description: "Deploy all three tower types and win.",
      rule: { kind: "use-all-tower-types" },
    },
    {
      id: "royal-accounting",
      name: "Royal Accounting",
      description: "Win after spending no more than 620 gold.",
      rule: { kind: "max-spent-gold", maxGold: 620 },
    },
  ],
  availableModifierIds: ["stingy-king"],
  rewardIds: [],
};

export const mimicMarketLevel: LevelDefinition = {
  id: "mimic-market",
  name: "Mimic Market",
  subtitle: "Retail bites back, and the till is always short.",
  act: 1,
  order: 2,
  estimatedMinutes: 18,
  threatSummary:
    "Warded coupon squires soak an opening hit; sprinting mimics keep restocking the aisles.",
  mechanicSummary:
    "The register desk and kiosk stall are too cramped and awning-covered for the Discount Wizard's arcane blasts; every Coupon Squire shrugs off its first hit.",
  environment: {
    theme: "bazaar",
    decorIds: ["awnings", "crates", "lantern-strings"],
    palette: { primary: 0xc97b3d, secondary: 0x7a4a24, accent: 0xf2d24b },
  },
  width: 960,
  height: 540,
  startingLives: 12,
  startingGold: 300,
  path: [
    { x: -36, y: 270 },
    { x: 210, y: 270 },
    { x: 210, y: 80 },
    { x: 430, y: 80 },
    { x: 430, y: 460 },
    { x: 670, y: 460 },
    { x: 670, y: 190 },
    { x: 996, y: 190 },
  ],
  pads: [
    { id: "bargain-bin", position: { x: 90, y: 210 } },
    {
      id: "register-desk",
      position: { x: 330, y: 170 },
      allowedTowerIds: ["fork-knight", "bardbarian"],
    },
    { id: "clearance-rack", position: { x: 330, y: 370 } },
    { id: "display-plinth", position: { x: 540, y: 270 } },
    { id: "food-court-table", position: { x: 560, y: 460 } },
    {
      id: "kiosk-stall",
      position: { x: 760, y: 330 },
      allowedTowerIds: ["fork-knight", "bardbarian"],
    },
    { id: "escalator-landing", position: { x: 820, y: 120 } },
    { id: "loading-dock", position: { x: 880, y: 250 } },
  ],
  waves: [
    {
      name: "Doors Open",
      preview:
        "Four shopper queues build from orderly lines into a full opening-hour crush.",
      spawns: wave(
        group("basic-goblin", 30, 17),
        group("basic-goblin", 30, 16, 430),
        group("basic-goblin", 30, 15, 850),
        group("fast-mimic", 14, 30, 1_200),
      ),
    },
    {
      name: "Blue Light Special",
      preview:
        "Two advertised mimic rushes cut through three sustained shopper formations.",
      spawns: wave(
        group("basic-goblin", 28, 17),
        group("fast-mimic", 14, 30, 230),
        group("basic-goblin", 30, 15, 600),
        group("fast-mimic", 16, 28, 920),
        group("basic-goblin", 30, 14, 1_250),
      ),
    },
    {
      name: "Coupon Clippers",
      preview:
        "Warded squires lead each new queue, repeatedly taxing slow single-target defenses.",
      spawns: wave(
        group("basic-goblin", 28, 16),
        group("coupon-squire", 12, 45, 180),
        group("basic-goblin", 30, 14, 620),
        group("coupon-squire", 14, 42, 850),
        group("fast-mimic", 16, 27, 1_180),
        group("coupon-squire", 10, 40, 1_450),
      ),
    },
    {
      name: "Mimic Aisle",
      preview:
        "Three chest displays tip over between shielded restocking crews.",
      spawns: wave(
        group("fast-mimic", 18, 25),
        group("coupon-squire", 12, 44, 300),
        group("fast-mimic", 20, 23, 680),
        group("basic-goblin", 28, 14, 950),
        group("coupon-squire", 14, 40, 1_250),
        group("fast-mimic", 18, 22, 1_550),
      ),
    },
    {
      name: "Rush Hour",
      preview:
        "Every register merges in five escalating phases with wards hiding the fastest shoppers.",
      spawns: wave(
        group("basic-goblin", 34, 14),
        group("coupon-squire", 12, 42, 180),
        group("fast-mimic", 18, 24, 550),
        group("basic-goblin", 32, 13, 900),
        group("coupon-squire", 16, 38, 1_180),
        group("fast-mimic", 20, 22, 1_520),
      ),
    },
    {
      name: "Inventory Audit",
      preview:
        "Loss-prevention trolls anchor a long audit while mimics exploit every recount.",
      spawns: wave(
        group("basic-goblin", 30, 14),
        group("tax-troll", 8, 82, 200),
        group("fast-mimic", 18, 24, 650),
        group("coupon-squire", 14, 40, 950),
        group("tax-troll", 8, 75, 1_250),
        group("basic-goblin", 32, 13, 1_550),
        group("fast-mimic", 18, 22, 1_820),
      ),
    },
    {
      name: "Security Sweep",
      preview:
        "Bog Guards lock down the aisles in three warded wedges while crowds keep shopping around them.",
      spawns: wave(
        group("basic-goblin", 32, 14),
        group("bog-guard", 10, 46, 220),
        group("coupon-squire", 14, 38, 600),
        group("fast-mimic", 20, 23, 900),
        group("bog-guard", 12, 42, 1_250),
        group("tax-troll", 8, 72, 1_500),
        group("basic-goblin", 34, 12, 1_780),
      ),
    },
    {
      name: "Closing Time",
      preview:
        "The shutters descend through seven continuous formations: crowds, armor, wards, and one final express checkout.",
      spawns: wave(
        group("basic-goblin", 36, 13),
        group("fast-mimic", 20, 24, 220),
        group("coupon-squire", 16, 38, 600),
        group("tax-troll", 9, 72, 900),
        group("bog-guard", 14, 40, 1_200),
        group("basic-goblin", 36, 12, 1_500),
        group("fast-mimic", 26, 20, 1_820),
      ),
    },
  ],
  mastery: [
    {
      id: "window-shopper",
      name: "Window Shopper",
      description: "Win having placed no more than five towers.",
      rule: { kind: "max-towers-placed", maxTowers: 5 },
    },
    {
      id: "refund-denied",
      name: "Refund Denied",
      description: "Win without letting a single mimic leak.",
      rule: { kind: "no-leaks-of", enemyId: "fast-mimic" },
    },
    {
      id: "closing-time",
      name: "Closing Time",
      description: "Win a battle fought under the Sale Rush.",
      rule: { kind: "victory-under-modifier", modifierId: "sale-rush" },
    },
  ],
  availableModifierIds: ["sale-rush"],
  rewardIds: ["fork-table-service"],
};

export const trollTollwayLevel: LevelDefinition = {
  id: "troll-tollway",
  name: "Troll Tollway",
  subtitle: "Every lane merges into the same armored bottleneck.",
  act: 1,
  order: 3,
  estimatedMinutes: 19,
  threatSummary:
    "Armored tax trolls form a rolling wall of receipts while queue jumpers refuse to ever slow down.",
  mechanicSummary:
    "Two bridge pads admit only licensed Fork Knights or Bardbarians, scheduled booth closures shut down a pad mid-wave, and Queue Jumpers ignore slows.",
  environment: {
    theme: "tollway",
    decorIds: ["toll-booths", "traffic-cones", "road-signs"],
    palette: { primary: 0x5a6b7a, secondary: 0x33404c, accent: 0xf4c542 },
  },
  width: 960,
  height: 540,
  startingLives: 12,
  startingGold: 320,
  path: [
    { x: -36, y: 450 },
    { x: 150, y: 450 },
    { x: 150, y: 200 },
    { x: 340, y: 200 },
    { x: 340, y: 480 },
    { x: 560, y: 480 },
    { x: 560, y: 90 },
    { x: 760, y: 90 },
    { x: 760, y: 340 },
    { x: 996, y: 340 },
  ],
  pads: [
    { id: "toll-booth-one", position: { x: 60, y: 340 } },
    {
      id: "toll-booth-two",
      position: { x: 250, y: 330 },
      shutdowns: [
        { waveIndex: 2, fromTick: 30, toTick: 80 },
        { waveIndex: 5, fromTick: 20, toTick: 70 },
      ],
    },
    {
      id: "barrier-arm",
      position: { x: 250, y: 130 },
      allowedTowerIds: ["fork-knight", "bardbarian"],
    },
    { id: "shoulder-lane", position: { x: 450, y: 340 } },
    {
      id: "overpass-perch",
      position: { x: 660, y: 60 },
      allowedTowerIds: ["fork-knight", "bardbarian"],
    },
    { id: "guard-shack", position: { x: 660, y: 250 } },
    { id: "exit-ramp", position: { x: 860, y: 250 } },
  ],
  waves: [
    {
      name: "Ticket Booth Line",
      preview:
        "Four lanes feed one booth in an increasingly impatient opening queue.",
      spawns: wave(
        group("basic-goblin", 32, 16),
        group("basic-goblin", 32, 15, 430),
        group("fast-mimic", 16, 28, 820),
        group("basic-goblin", 32, 14, 1_150),
      ),
    },
    {
      name: "Full Toll",
      preview:
        "Auditors anchor three traffic columns while commuters stack up behind them.",
      spawns: wave(
        group("basic-goblin", 30, 15),
        group("tax-troll", 9, 80, 220),
        group("basic-goblin", 32, 14, 620),
        group("tax-troll", 10, 75, 950),
        group("fast-mimic", 18, 24, 1_300),
        group("basic-goblin", 28, 13, 1_580),
      ),
    },
    {
      name: "Detour",
      preview:
        "One booth closes as three slow-proof jumper packs weave through sustained traffic.",
      spawns: wave(
        group("basic-goblin", 30, 15),
        group("queue-jumper", 16, 29, 180),
        group("tax-troll", 8, 80, 620),
        group("queue-jumper", 18, 27, 850),
        group("basic-goblin", 32, 13, 1_180),
        group("queue-jumper", 20, 25, 1_500),
      ),
    },
    {
      name: "Gridlock",
      preview:
        "Troll walls and jumper wedges alternate, punishing defenses committed to only armor or control.",
      spawns: wave(
        group("tax-troll", 10, 76),
        group("queue-jumper", 18, 27, 300),
        group("basic-goblin", 32, 13, 680),
        group("tax-troll", 10, 72, 980),
        group("queue-jumper", 20, 24, 1_300),
        group("tax-troll", 9, 68, 1_650),
      ),
    },
    {
      name: "Merge Ahead",
      preview:
        "Express mimics repeatedly merge around armored roadblocks and force late-lane coverage.",
      spawns: wave(
        group("basic-goblin", 32, 14),
        group("fast-mimic", 20, 23, 220),
        group("tax-troll", 10, 74, 650),
        group("fast-mimic", 22, 22, 980),
        group("queue-jumper", 18, 25, 1_300),
        group("tax-troll", 10, 68, 1_650),
      ),
    },
    {
      name: "Peak Traffic",
      preview:
        "The other booth closes during a six-phase rush led by jumpers and backed by heavy auditors.",
      spawns: wave(
        group("basic-goblin", 34, 13),
        group("queue-jumper", 20, 25, 180),
        group("tax-troll", 10, 72, 620),
        group("fast-mimic", 20, 22, 950),
        group("queue-jumper", 22, 23, 1_280),
        group("tax-troll", 11, 66, 1_650),
        group("basic-goblin", 34, 12, 1_900),
      ),
    },
    {
      name: "Overtime",
      preview:
        "Management extends the shift through alternating armored convoys and no-slow express lanes.",
      spawns: wave(
        group("tax-troll", 11, 70),
        group("queue-jumper", 20, 24, 280),
        group("basic-goblin", 34, 12, 650),
        group("tax-troll", 12, 66, 980),
        group("fast-mimic", 22, 21, 1_320),
        group("queue-jumper", 22, 22, 1_650),
        group("tax-troll", 10, 64, 1_950),
      ),
    },
    {
      name: "Toll Amnesty",
      preview:
        "Every unpaid fine arrives in linked formations, ending with armor screening two speed threats.",
      spawns: wave(
        group("basic-goblin", 36, 12),
        group("tax-troll", 12, 68, 220),
        group("queue-jumper", 22, 23, 620),
        group("fast-mimic", 22, 21, 950),
        group("tax-troll", 12, 64, 1_280),
        group("queue-jumper", 24, 21, 1_620),
        group("fast-mimic", 24, 20, 1_900),
      ),
    },
  ],
  mastery: [
    {
      id: "exact-change",
      name: "Exact Change",
      description: "Finish the battle with at least 150 gold in hand.",
      rule: { kind: "min-final-gold", minGold: 150 },
    },
    {
      id: "orderly-queue",
      name: "Orderly Queue",
      description: "Win without letting a single Queue Jumper leak.",
      rule: { kind: "no-leaks-of", enemyId: "queue-jumper" },
    },
    {
      id: "no-resale-value",
      name: "No Resale Value",
      description: "Win without selling a single tower.",
      rule: { kind: "no-tower-sold" },
    },
  ],
  availableModifierIds: ["roadworks"],
  rewardIds: [],
};

export const castleHassleLevel: LevelDefinition = {
  id: "castle-hassle",
  name: "Castle Hassle",
  subtitle: "The Act I finale. Bring napkins.",
  act: 1,
  order: 4,
  estimatedMinutes: 19,
  threatSummary:
    "A full-roster finale ending with Baron von Bog, who calls in an escort at half health and speeds up for phase two.",
  mechanicSummary:
    "Alternating, telegraphed courtyard pad shutdowns close the gatehouse and banquet-hall pads in turn, plus a boss fight with a half-health phase transition, escort summons, and a faster enraged second phase.",
  environment: {
    theme: "castle-courtyard",
    decorIds: ["banners", "battlements", "braziers"],
    palette: { primary: 0x6b4e8a, secondary: 0x3d2b52, accent: 0xe8b23d },
  },
  width: 960,
  height: 540,
  startingLives: 14,
  startingGold: 320,
  path: [
    { x: -36, y: 270 },
    { x: 250, y: 270 },
    { x: 250, y: 80 },
    { x: 500, y: 80 },
    { x: 500, y: 460 },
    { x: 720, y: 460 },
    { x: 720, y: 150 },
    { x: 996, y: 150 },
  ],
  pads: [
    {
      id: "gatehouse-perch",
      position: { x: 100, y: 190 },
      /** The portcullis winch periodically locks this outer pad down. */
      shutdowns: [
        { waveIndex: 1, fromTick: 20, toTick: 70 },
        { waveIndex: 4, fromTick: 20, toTick: 70 },
      ],
    },
    { id: "portcullis-ledge", position: { x: 100, y: 330 } },
    { id: "courtyard-well", position: { x: 380, y: 150 } },
    { id: "herb-garden", position: { x: 350, y: 260 } },
    {
      id: "banquet-table",
      position: { x: 610, y: 270 },
      /** Kitchen staff clear this inner pad on an alternating schedule so
       * both closures are never active at the same time. */
      shutdowns: [
        { waveIndex: 2, fromTick: 20, toTick: 70 },
        { waveIndex: 5, fromTick: 20, toTick: 70 },
      ],
    },
    { id: "armory-step", position: { x: 610, y: 460 } },
    { id: "gallery-balcony", position: { x: 620, y: 150 } },
    { id: "chapel-alcove", position: { x: 850, y: 60 } },
    { id: "throne-dais", position: { x: 850, y: 250 } },
  ],
  waves: [
    {
      name: "Gate Crashers",
      preview:
        "Four uninvited companies test the outer wall before the castle can finish breakfast.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 32, 15),
        group("basic-goblin", 32, 14, 420),
        group("fast-mimic", 8, 27, 800),
        group("basic-goblin", 34, 13, 1_120),
      ),
    },
    {
      name: "Second Wave",
      preview:
        "Mimic companies exploit three crowd screens while the portcullis winch locks down the gatehouse pad.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 30, 14),
        group("fast-mimic", 18, 24, 190),
        group("basic-goblin", 32, 13, 580),
        group("fast-mimic", 20, 22, 900),
        group("basic-goblin", 34, 12, 1_220),
        group("tax-troll", 8, 72, 1_550),
      ),
    },
    {
      name: "Reinforcements",
      preview:
        "Trolls and jumpers trade the lead through five columns while kitchen staff clear the banquet table.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 30, 14),
        group("tax-troll", 10, 72, 180),
        group("queue-jumper", 18, 26, 620),
        group("tax-troll", 10, 68, 950),
        group("basic-goblin", 34, 12, 1_260),
        group("queue-jumper", 20, 23, 1_580),
      ),
    },
    {
      name: "The Long Hall",
      preview:
        "Jumpers and mimics alternate six speed phases while warded guards protect each handoff.",
      spawns: pacedWave(
        90,
        group("queue-jumper", 18, 25),
        group("fast-mimic", 18, 23, 280),
        group("bog-guard", 10, 44, 620),
        group("queue-jumper", 20, 23, 920),
        group("fast-mimic", 20, 21, 1_250),
        group("bog-guard", 12, 40, 1_580),
      ),
    },
    {
      name: "Keep Watch",
      preview:
        "The garrison wakes in layered warded ranks as the gatehouse pad locks down again.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 34, 13),
        group("bog-guard", 12, 42, 200),
        group("tax-troll", 11, 68, 620),
        group("coupon-squire", 16, 36, 950),
        group("basic-goblin", 36, 12, 1_280),
        group("bog-guard", 14, 38, 1_620),
      ),
    },
    {
      name: "All Hands",
      preview:
        "Every guard rotates through the courtyard in mixed formations while the banquet table closes.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 34, 12),
        group("fast-mimic", 20, 22, 180),
        group("tax-troll", 11, 66, 600),
        group("queue-jumper", 20, 23, 920),
        group("bog-guard", 14, 38, 1_250),
        group("fast-mimic", 22, 20, 1_580),
        group("tax-troll", 10, 62, 1_900),
      ),
    },
    {
      name: "The Vanguard",
      preview:
        "The Baron's warded vanguard advances behind auditors, then releases two late speed wings.",
      spawns: pacedWave(
        90,
        group("bog-guard", 14, 40),
        group("tax-troll", 12, 66, 250),
        group("basic-goblin", 36, 12, 680),
        group("bog-guard", 16, 36, 1_000),
        group("queue-jumper", 22, 22, 1_340),
        group("fast-mimic", 22, 20, 1_650),
        group("tax-troll", 11, 60, 1_950),
      ),
    },
    {
      name: "Banquet Evacuation",
      preview:
        "Guests flee in organized disorder while elite guards repeatedly retake the center lane.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 38, 12),
        group("coupon-squire", 18, 34, 200),
        group("bog-guard", 16, 36, 620),
        group("fast-mimic", 22, 20, 950),
        group("tax-troll", 12, 62, 1_280),
        group("queue-jumper", 24, 21, 1_620),
        group("bog-guard", 14, 34, 1_900),
      ),
    },
    {
      name: "Baron von Bog",
      preview:
        "Escort formations soften the courtyard before the Baron enters, phases, summons guards, and leads the last charge.",
      spawns: pacedWave(
        90,
        group("basic-goblin", 38, 12),
        group("tax-troll", 12, 64, 220),
        group("queue-jumper", 22, 22, 620),
        group("bog-guard", 16, 36, 950),
        group("fast-mimic", 24, 20, 1_280),
        group("tax-troll", 12, 60, 1_620),
        group("baron-von-bog", 1, 1, 1_900),
        group("bog-guard", 16, 34, 1_920),
      ),
    },
  ],
  mastery: [
    {
      id: "courtyard-custodian",
      name: "Courtyard Custodian",
      description: "Win without leaking a single enemy.",
      rule: { kind: "no-leaks" },
    },
    {
      id: "skeleton-crew",
      name: "Skeleton Crew",
      description: "Win having used no more than two tower types.",
      rule: { kind: "max-tower-types", maxTypes: 2 },
    },
    {
      id: "before-the-bell",
      name: "Before the Bell",
      description: "Defeat the Baron before he covers 75% of the path.",
      rule: { kind: "boss-defeated-before-path-percent", maxPercent: 75 },
    },
  ],
  availableModifierIds: [],
  rewardIds: ["emergency-tea-break"],
};

export const levelDefinitions = {
  [muddyMoatLevel.id]: muddyMoatLevel,
  [mimicMarketLevel.id]: mimicMarketLevel,
  [trollTollwayLevel.id]: trollTollwayLevel,
  [castleHassleLevel.id]: castleHassleLevel,
} as const satisfies Record<string, LevelDefinition>;

export const campaignNodes: readonly CampaignNodeDefinition[] = [
  {
    id: "muddy-moat",
    levelId: "muddy-moat",
    name: "The Muddy Moat",
    description: "Playable now. Boots not included.",
    position: { x: 18, y: 55 },
    act: 1,
    order: 1,
    unlock: "start",
    unlockSourceId: null,
    unlockConditions: [{ kind: "start" }],
    rewardIds: [],
  },
  {
    id: "mimic-market",
    levelId: "mimic-market",
    name: "Mimic Market",
    description: "Retail bites back.",
    position: { x: 45, y: 30 },
    act: 1,
    order: 2,
    unlock: "victory",
    unlockSourceId: "muddy-moat",
    unlockConditions: [{ kind: "victory", levelId: "muddy-moat" }],
    rewardIds: ["fork-table-service"],
  },
  {
    id: "troll-tollway",
    levelId: "troll-tollway",
    name: "Troll Tollway",
    description: "Every lane merges into the same armored bottleneck.",
    position: { x: 68, y: 60 },
    act: 1,
    order: 3,
    // Legacy field kept exactly as it always was: players who mastered the
    // Stingy King's budget before Mimic Market existed already unlocked this
    // node that way, and `unlockConditions` below preserves that path
    // alongside the new victory-based progression.
    unlock: "modifier",
    unlockSourceId: "stingy-king",
    unlockConditions: [
      { kind: "victory", levelId: "mimic-market" },
      { kind: "legacy-modifier", modifierId: "stingy-king" },
    ],
    rewardIds: [],
  },
  {
    id: "castle-hassle",
    levelId: "castle-hassle",
    name: "Castle Hassle",
    description: "The Act I finale. Bring napkins.",
    position: { x: 88, y: 35 },
    act: 1,
    order: 4,
    unlock: "victory",
    unlockSourceId: "troll-tollway",
    unlockConditions: [{ kind: "victory", levelId: "troll-tollway" }],
    rewardIds: ["emergency-tea-break"],
  },
];
