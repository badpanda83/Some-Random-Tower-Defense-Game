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
      { damage: 8, range: 136, cooldownTicks: 48, upgradeCost: 66 },
      { damage: 14, range: 149, cooldownTicks: 43, upgradeCost: 105 },
      { damage: 23, range: 164, cooldownTicks: 38, upgradeCost: null },
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
    reward: 10,
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
    reward: 15,
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
    reward: 28,
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
    reward: 160,
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
    reward: 18,
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
    reward: 16,
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
    reward: 20,
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
    reward: 220,
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
    description:
      "Begin with 80 less gold while enemies enjoy a 15% wellness bonus.",
    startingGoldDelta: -80,
    enemyHealthPercent: 115,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 0,
  },
  "sale-rush": {
    id: "sale-rush",
    name: "Sale Rush",
    description:
      "Word of a sale spread fast: shoppers arrive 25% sooner, begin with 50 less gold, and enjoy a 10% wellness bonus.",
    startingGoldDelta: -50,
    enemyHealthPercent: 110,
    spawnIntervalPercent: 75,
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
  estimatedMinutes: 30,
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
      preview: "Eight entry-level goblins arrive with forms unsigned.",
      spawns: wave(group("basic-goblin", 8, 22)),
    },
    {
      name: "Chest Day",
      preview: "Goblin paperwork conceals four suspiciously athletic chests.",
      spawns: wave(
        group("basic-goblin", 7, 20),
        group("fast-mimic", 4, 26, 34),
      ),
    },
    {
      name: "Fiscal Friction",
      preview: "Tax trolls audit a stream of underreported goblins.",
      spawns: wave(group("tax-troll", 3, 62), group("basic-goblin", 9, 16, 18)),
    },
    {
      name: "Prime Delivery",
      preview: "Mimics sprint. Trolls object to the shipping surcharge.",
      spawns: wave(group("fast-mimic", 10, 15), group("tax-troll", 3, 58, 22)),
    },
    {
      name: "Mandatory Fun",
      preview: "The entire dungeon attends a team-building exercise.",
      spawns: wave(
        group("basic-goblin", 12, 12),
        group("fast-mimic", 7, 21, 16),
        group("tax-troll", 4, 52, 28),
      ),
    },
    {
      name: "Exit Interview",
      preview: "A dragon intern and its unhelpful references request passage.",
      spawns: wave(
        group("basic-goblin", 8, 17),
        group("tax-troll", 3, 50, 26),
        group("dragon-intern", 1, 1, 65),
        group("fast-mimic", 6, 18, 78),
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
  estimatedMinutes: 35,
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
    { id: "bargain-bin", position: { x: 90, y: 150 } },
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
      preview: "Ten shoppers pile through before the sensors even chime.",
      spawns: wave(group("basic-goblin", 10, 22)),
    },
    {
      name: "Blue Light Special",
      preview:
        "A discount siren draws goblins and a handful of sprinting mimics.",
      spawns: wave(
        group("basic-goblin", 8, 20),
        group("fast-mimic", 5, 28, 10),
      ),
    },
    {
      name: "Coupon Clippers",
      preview:
        "Squires march in behind expired coupons and unbreakable resolve.",
      spawns: wave(
        group("basic-goblin", 8, 18),
        group("coupon-squire", 6, 34, 8),
      ),
    },
    {
      name: "Mimic Aisle",
      preview: "The novelty chest display finally tips over.",
      spawns: wave(
        group("fast-mimic", 10, 16),
        group("coupon-squire", 4, 40, 20),
      ),
    },
    {
      name: "Rush Hour",
      preview: "Every register queue merges into one very motivated line.",
      spawns: wave(
        group("basic-goblin", 10, 14),
        group("fast-mimic", 7, 20, 10),
        group("coupon-squire", 4, 36, 30),
      ),
    },
    {
      name: "Inventory Audit",
      preview: "Loss-prevention trolls arrive to reconcile the shrinkage.",
      spawns: wave(
        group("tax-troll", 3, 60),
        group("basic-goblin", 9, 16, 10),
        group("fast-mimic", 5, 24, 40),
      ),
    },
    {
      name: "Closing Time",
      preview: "One last surge before the shutters come down for good.",
      spawns: wave(
        group("basic-goblin", 8, 16),
        group("fast-mimic", 8, 18, 14),
        group("coupon-squire", 5, 30, 10),
        group("tax-troll", 2, 70, 60),
        group("bog-guard", 2, 65, 72),
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
  estimatedMinutes: 40,
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
      preview: "Ten goblins queue for a ticket nobody explained how to use.",
      spawns: wave(group("basic-goblin", 10, 20)),
    },
    {
      name: "Full Toll",
      preview: "Tax trolls demand exact change from a very confused crowd.",
      spawns: wave(group("tax-troll", 4, 55), group("basic-goblin", 8, 16, 10)),
    },
    {
      name: "Detour",
      preview: "One booth closes for maintenance. Queue jumpers do not care.",
      spawns: wave(
        group("queue-jumper", 6, 30),
        group("basic-goblin", 8, 16, 8),
      ),
    },
    {
      name: "Gridlock",
      preview: "Trolls and jumpers fight for the same single open lane.",
      spawns: wave(group("tax-troll", 5, 50), group("queue-jumper", 5, 28, 15)),
    },
    {
      name: "Merge Ahead",
      preview: "Mimics slip through the cones while trolls hold the line.",
      spawns: wave(group("fast-mimic", 8, 18), group("tax-troll", 4, 48, 30)),
    },
    {
      name: "Peak Traffic",
      preview: "The other booth closes too. Nobody is happy about this.",
      spawns: wave(
        group("queue-jumper", 8, 22),
        group("basic-goblin", 10, 14, 10),
        group("tax-troll", 3, 55, 40),
      ),
    },
    {
      name: "Overtime",
      preview: "Management extends the shift. The trolls file a complaint.",
      spawns: wave(group("tax-troll", 6, 45), group("queue-jumper", 6, 24, 25)),
    },
    {
      name: "Toll Amnesty",
      preview: "Every unpaid fine comes due on the same regrettable afternoon.",
      spawns: wave(
        group("basic-goblin", 10, 14),
        group("queue-jumper", 7, 20, 14),
        group("tax-troll", 5, 45, 20),
        group("fast-mimic", 6, 18, 60),
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
  estimatedMinutes: 50,
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
      position: { x: 100, y: 150 },
      /** The portcullis winch periodically locks this outer pad down. */
      shutdowns: [
        { waveIndex: 1, fromTick: 20, toTick: 70 },
        { waveIndex: 4, fromTick: 20, toTick: 70 },
      ],
    },
    { id: "portcullis-ledge", position: { x: 100, y: 390 } },
    { id: "courtyard-well", position: { x: 380, y: 150 } },
    { id: "herb-garden", position: { x: 380, y: 400 } },
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
      preview: "Ten goblins storm the gatehouse without an invitation.",
      spawns: wave(group("basic-goblin", 10, 18)),
    },
    {
      name: "Second Wave",
      preview:
        "Mimics slip in through the postern door while the portcullis winch locks down the gatehouse pad.",
      spawns: wave(
        group("fast-mimic", 8, 18),
        group("basic-goblin", 6, 16, 10),
      ),
    },
    {
      name: "Reinforcements",
      preview:
        "Trolls and jumpers arrive together, as arranged, while kitchen staff briefly clear the banquet table pad.",
      spawns: wave(group("tax-troll", 5, 50), group("queue-jumper", 5, 26, 20)),
    },
    {
      name: "The Long Hall",
      preview: "Jumpers sprint the corridor while mimics case the tapestries.",
      spawns: wave(
        group("queue-jumper", 8, 22),
        group("fast-mimic", 6, 18, 30),
      ),
    },
    {
      name: "Keep Watch",
      preview:
        "The garrison finally wakes up. About time. The portcullis winch locks the gatehouse pad down again.",
      spawns: wave(
        group("tax-troll", 6, 45),
        group("basic-goblin", 10, 14, 15),
      ),
    },
    {
      name: "All Hands",
      preview:
        "Every remaining guard is called to the courtyard at once, and the banquet table pad closes once more.",
      spawns: wave(
        group("fast-mimic", 8, 16),
        group("tax-troll", 4, 48, 20),
        group("queue-jumper", 6, 22, 45),
      ),
    },
    {
      name: "The Vanguard",
      preview: "The Baron's personal guard tests the walls before he arrives.",
      spawns: wave(group("tax-troll", 6, 40), group("queue-jumper", 7, 20, 30)),
    },
    {
      name: "Baron von Bog",
      preview:
        "The Baron himself, plus every guest he could not be bothered to dismiss.",
      spawns: wave(
        group("baron-von-bog", 1, 1),
        group("tax-troll", 4, 50, 40),
        group("queue-jumper", 6, 20, 10),
        group("fast-mimic", 6, 16, 90),
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
