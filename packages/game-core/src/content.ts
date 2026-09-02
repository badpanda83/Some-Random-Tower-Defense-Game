import type {
  CampaignNodeDefinition,
  EnemyDefinition,
  FullBossEncounterDefinition,
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
  routeId?: string,
): SpawnDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    enemyId,
    atTick: startTick + index * everyTicks,
    ...(routeId ? { routeId } : {}),
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
        damage: 72,
        range: 152,
        cooldownTicks: 11,
        upgradeCost: null,
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
      { damage: 68, range: 184, cooldownTicks: 27, upgradeCost: 165 },
      {
        damage: 68,
        range: 184,
        cooldownTicks: 27,
        upgradeCost: null,
        splashRadiusOverride: 84,
        ignoresArmor: true,
      },
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
      { damage: 68, range: 164, cooldownTicks: 32, upgradeCost: 150 },
      {
        damage: 68,
        range: 164,
        cooldownTicks: 32,
        upgradeCost: null,
        supportPulse: { periodTicks: 100, activeTicks: 40, rangeBonus: 70 },
      },
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
  "frozen-auditor": {
    id: "frozen-auditor",
    name: "Frozen Asset Auditor",
    description:
      "An ice-plated specialist that shrugs off Fork Knight strikes but cracks under arcane or sonic coverage.",
    color: 0x9fe0f2,
    maxHealth: 245,
    speed: 37,
    armor: 8,
    reward: 4,
    lifeDamage: 2,
    boss: false,
    traits: [
      { kind: "damage-resistance", damageType: "physical", percent: 25 },
    ],
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
    encounterRole: "miniboss",
    boss: false,
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
  "warranty-wraith": {
    id: "warranty-wraith",
    name: "Warranty Wraith",
    description:
      "A translucent claims adjuster. Spellwork slides right off; a solid whack still lands.",
    color: 0x8fd8e8,
    maxHealth: 210,
    speed: 46,
    armor: 3,
    reward: 5,
    lifeDamage: 2,
    boss: false,
    traits: [
      { kind: "damage-resistance", damageType: "arcane", percent: 50 },
      { kind: "damage-resistance", damageType: "physical", percent: 150 },
    ],
  },
  "middle-manager-mage": {
    id: "middle-manager-mage",
    name: "Middle Manager Mage",
    description:
      "Casts a visible motivational aura that makes every nearby coworker walk faster.",
    color: 0xe8955a,
    maxHealth: 165,
    speed: 44,
    armor: 1,
    reward: 4,
    lifeDamage: 2,
    boss: false,
    traits: [{ kind: "speed-aura", radius: 110, speedPercent: 130 }],
  },
  "comptroller-general": {
    id: "comptroller-general",
    name: "Comptroller General",
    description:
      "An armored auditor-troll who calls in a queue-jumping escort the moment the budget looks tight.",
    color: 0x9a7a4a,
    maxHealth: 980,
    speed: 34,
    armor: 9,
    reward: 40,
    lifeDamage: 4,
    boss: true,
    bossPhase: {
      healthThresholdPercent: 50,
      speedMultiplierPercent: 150,
      escort: { enemyId: "queue-jumper", count: 3 },
    },
  },
  "refund-slime": {
    id: "refund-slime",
    name: "Refund Slime",
    description:
      "Denies every claim, then splits into two smaller claims the instant it's defeated.",
    color: 0x7de08a,
    maxHealth: 150,
    speed: 42,
    armor: 0,
    reward: 2,
    lifeDamage: 1,
    boss: false,
    traits: [
      { kind: "split-on-defeat", intoEnemyId: "basic-goblin", count: 2 },
    ],
  },
  "grand-till-mimic": {
    id: "grand-till-mimic",
    name: "Grand Till Mimic",
    description:
      "The market's warded master register opens wide, marks everything down, and calls express checkout.",
    color: 0xffc857,
    maxHealth: 1_350,
    speed: 38,
    armor: 4,
    reward: 70,
    lifeDamage: 6,
    boss: true,
    traits: [{ kind: "first-hit-ward" }],
    initialBossStage: {
      id: "locked-register",
      name: "Locked Register",
      description: "A visible brass ward seals the till at entry.",
    },
    bossPhases: [
      {
        id: "clearance-rush",
        name: "Clearance Rush",
        description:
          "At 60% health, the register accelerates through the aisle.",
        healthThresholdPercent: 60,
        speedMultiplierPercent: 125,
        removesWard: true,
      },
      {
        id: "express-checkout",
        name: "Express Checkout",
        description:
          "At 25% health, three Express Mimics answer the final bell.",
        healthThresholdPercent: 25,
        speedMultiplierPercent: 165,
        escort: { enemyId: "fast-mimic", count: 3 },
        reinforcementCallId: "express-checkout",
      },
    ],
  },
  "lava-lamp-landlord": {
    id: "lava-lamp-landlord",
    name: "Lava Lamp Landlord",
    description:
      "The district's molten landlord rises after the final eruption, hardens its shell, and serves one last eviction notice.",
    color: 0xff6b35,
    maxHealth: 2_650,
    speed: 29,
    armor: 7,
    reward: 130,
    lifeDamage: 8,
    boss: true,
    traits: [{ kind: "first-hit-ward" }],
    initialBossStage: {
      id: "molten-lease",
      name: "Molten Lease",
      description: "A diamond-shaped heat ward and one manager open the lease.",
      escort: { enemyId: "middle-manager-mage", count: 1 },
    },
    bossPhases: [
      {
        id: "hardened-shell",
        name: "Hardened Shell",
        description:
          "At 65% health, cooled plates add armor as the ward breaks.",
        healthThresholdPercent: 65,
        speedMultiplierPercent: 100,
        armorBonus: 5,
        removesWard: true,
      },
      {
        id: "liquidation",
        name: "Liquidation",
        description:
          "At 28% health, the landlord surges forward and calls split cleanup.",
        healthThresholdPercent: 28,
        speedMultiplierPercent: 165,
        escort: { enemyId: "refund-slime", count: 4 },
        reinforcementCallId: "final-eviction",
      },
    ],
  },
  "queen-of-pending-litigation": {
    id: "queen-of-pending-litigation",
    name: "Queen of Pending Litigation",
    description:
      "Warded by procedure, backed by management, and considerably faster once the paperwork runs out.",
    color: 0xd23d63,
    maxHealth: 2_400,
    speed: 30,
    armor: 8,
    reward: 120,
    lifeDamage: 8,
    boss: true,
    traits: [{ kind: "first-hit-ward" }],
    bossPhases: [
      {
        healthThresholdPercent: 50,
        speedMultiplierPercent: 100,
        escort: { enemyId: "middle-manager-mage", count: 2 },
      },
      {
        healthThresholdPercent: 20,
        speedMultiplierPercent: 180,
        removesWard: true,
      },
    ],
  },
  "chief-executive-dragon": {
    id: "chief-executive-dragon",
    name: "Chief Executive Dragon",
    description:
      "Arrives behind a severance ward, conducts an armored review, then rages through one final reinforcement call.",
    color: 0xb3263e,
    maxHealth: 4_200,
    speed: 25,
    armor: 8,
    reward: 220,
    lifeDamage: 12,
    boss: true,
    traits: [{ kind: "first-hit-ward" }],
    initialBossStage: {
      id: "severance-ward",
      name: "Severance Ward",
      description: "A visible ward and two retained escorts open the review.",
      escort: { enemyId: "bog-guard", count: 2 },
    },
    bossPhases: [
      {
        id: "armored-review",
        name: "Armored Main Review",
        description: "At 70% health, the executive plates lock into place.",
        healthThresholdPercent: 70,
        speedMultiplierPercent: 100,
        armorBonus: 8,
        removesWard: true,
      },
      {
        id: "rage-reforecast",
        name: "Rage Reforecast",
        description:
          "At 32% health, the dragon accelerates and makes one final call.",
        healthThresholdPercent: 32,
        speedMultiplierPercent: 165,
        escort: { enemyId: "middle-manager-mage", count: 3 },
        reinforcementCallId: "final-reinforcement",
      },
    ],
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
  "thin-ice": {
    id: "thin-ice",
    name: "Thin Ice",
    description:
      "Begin with 15 less gold; the frost creeps in slightly faster and everything hits a touch harder.",
    startingGoldDelta: -15,
    enemyHealthPercent: 104,
    spawnIntervalPercent: 95,
    padShutdownExtraTicks: 0,
  },
  "red-tape": {
    id: "red-tape",
    name: "Red Tape",
    description:
      "Begin with 15 less gold; every telegraphed permit shutdown runs 50 ticks longer.",
    startingGoldDelta: -15,
    enemyHealthPercent: 100,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 50,
  },
  "hot-seat": {
    id: "hot-seat",
    name: "Hot Seat",
    description:
      "Eruptions linger 45 ticks longer and the district opens 20 gold short.",
    startingGoldDelta: -20,
    enemyHealthPercent: 100,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 45,
  },
  "referral-only": {
    id: "referral-only",
    name: "Referral Only",
    description:
      "Every arrival has 8% more health and networking starts 8% sooner.",
    startingGoldDelta: 0,
    enemyHealthPercent: 108,
    spawnIntervalPercent: 92,
    padShutdownExtraTicks: 0,
  },
  "executive-mandate": {
    id: "executive-mandate",
    name: "Executive Mandate",
    description:
      "Quarterly targets cut the opening budget by 35 and raise enemy health by 6%.",
    startingGoldDelta: -35,
    enemyHealthPercent: 106,
    spawnIntervalPercent: 100,
    padShutdownExtraTicks: 0,
  },
} as const satisfies Record<string, ModifierDefinition>;

export const rewardDefinitions = {
  "fork-table-service": {
    kind: "tower-rank",
    id: "fork-table-service",
    name: "Table Service",
    description:
      "Fork Knight rank IV: a focused 72-damage strike on an 11-tick cadence, preserving its single-target role.",
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
  "wizard-actual-certification": {
    kind: "tower-rank",
    id: "wizard-actual-certification",
    name: "Actual Certification",
    description:
      "Discount Wizard rank IV: notarized at last, with a larger blast radius that bypasses armor entirely.",
    towerId: "discount-wizard",
    unlockedLevel: 4,
  },
  "bardbarian-power-chord": {
    kind: "tower-rank",
    id: "bardbarian-power-chord",
    name: "Power Chord",
    description:
      "Bardbarian rank IV: a periodic power chord extends allied haste and control coverage.",
    towerId: "bardbarian",
    unlockedLevel: 4,
  },
  "hot-seat-challenge": {
    kind: "modifier-unlock",
    id: "hot-seat-challenge",
    name: "Hot Seat",
    description: "Unlocks the Hot Seat challenge for Lava Lamp District.",
    modifierId: "hot-seat",
  },
  "referral-only-challenge": {
    kind: "modifier-unlock",
    id: "referral-only-challenge",
    name: "Referral Only",
    description:
      "Unlocks the Referral Only challenge for the Necromancers' Networking Event.",
    modifierId: "referral-only",
  },
  "executive-mandate-challenge": {
    kind: "modifier-unlock",
    id: "executive-mandate-challenge",
    name: "Executive Mandate",
    description:
      "Unlocks the Executive Mandate challenge for Quarterly Dragon Review.",
    modifierId: "executive-mandate",
  },
  "campaign-epilogue": {
    kind: "campaign",
    id: "campaign-epilogue",
    name: "Campaign Epilogue",
    description: "Unlocks the campaign epilogue after the final review.",
    featureId: "epilogue",
  },
  "completion-crest": {
    kind: "cosmetic",
    id: "completion-crest",
    name: "Completion Crest",
    description: "A crest for completing all ten campaign missions.",
    cosmeticType: "crest",
  },
  "executive-palette": {
    kind: "cosmetic",
    id: "executive-palette",
    name: "Executive Palette",
    description: "A campaign-completion crimson and gold palette.",
    cosmeticType: "palette",
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
    "Goblin filler, sprinting mimics, armored tax trolls, and a rage-phase Dragon Intern miniboss.",
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
    "Warded Coupon Squires and sprinting mimics build toward the Grand Till Mimic's warded, phased closing rush.",
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
      name: "Grand Till Closing",
      preview:
        "Boss: the warded Grand Till Mimic enters after six formations, then accelerates and calls three Express Mimics at final checkout.",
      spawns: wave(
        group("basic-goblin", 36, 13),
        group("fast-mimic", 20, 24, 220),
        group("coupon-squire", 16, 38, 600),
        group("tax-troll", 9, 72, 900),
        group("bog-guard", 14, 40, 1_200),
        group("basic-goblin", 36, 12, 1_500),
        group("grand-till-mimic", 1, 1, 1_820),
        group("fast-mimic", 12, 22, 1_840),
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

export const frozenAssetsLevel: LevelDefinition = {
  id: "frozen-assets",
  name: "Frozen Assets",
  subtitle: "Act II opens on a lake that legally isn't liquid.",
  act: 2,
  order: 5,
  estimatedMinutes: 15,
  threatSummary:
    "Physical-resistant Frozen Asset Auditors, slow-immune Queue Jumpers, warded Coupon Squires, and arcane-resistant Warranty Wraiths cross two icy shores toward the vault.",
  mechanicSummary:
    "Two routes hug opposite shores of a frozen lake and merge at the vault; the lane-center and merge-adjacent pads sit on thin ice that rejects Fork Knights, while each shore keeps one safe Fork pad and a marked speed stretch.",
  environment: {
    theme: "frozen-lake",
    decorIds: ["ice-cracks", "frozen-reeds", "snow-drifts"],
    palette: { primary: 0x1d3a52, secondary: 0x11202f, accent: 0x9fe0f2 },
  },
  width: 960,
  height: 540,
  startingLives: 14,
  startingGold: 420,
  path: [
    { x: -36, y: 120 },
    { x: 200, y: 120 },
    { x: 200, y: 260 },
    { x: 420, y: 260 },
    { x: 420, y: 90 },
    { x: 680, y: 90 },
    { x: 680, y: 270 },
    { x: 996, y: 270 },
  ],
  routes: [
    {
      id: "north-shore",
      path: [
        { x: -36, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 260 },
        { x: 420, y: 260 },
        { x: 420, y: 90 },
        { x: 680, y: 90 },
        { x: 680, y: 270 },
        { x: 996, y: 270 },
      ],
    },
    {
      id: "south-shore",
      path: [
        { x: -36, y: 420 },
        { x: 200, y: 420 },
        { x: 200, y: 280 },
        { x: 420, y: 280 },
        { x: 420, y: 450 },
        { x: 680, y: 450 },
        { x: 680, y: 270 },
        { x: 996, y: 270 },
      ],
    },
  ],
  speedZones: [
    {
      routeId: "north-shore",
      fromPercent: 40,
      toPercent: 72,
      speedPercent: 128,
    },
    {
      routeId: "south-shore",
      fromPercent: 40,
      toPercent: 72,
      speedPercent: 128,
    },
  ],
  pads: [
    { id: "frost-perch", position: { x: 150, y: 60 }, laneId: "north-shore" },
    {
      id: "iceberg-shelf",
      position: { x: 330, y: 180 },
      laneId: "north-shore",
      deniedTowerIds: ["fork-knight"],
    },
    {
      id: "floe-crossing",
      position: { x: 150, y: 480 },
      laneId: "south-shore",
    },
    {
      id: "cold-storage-dock",
      position: { x: 330, y: 360 },
      laneId: "south-shore",
      deniedTowerIds: ["fork-knight"],
    },
    {
      id: "vault-approach-north",
      position: { x: 560, y: 90 },
      laneId: "shared",
      deniedTowerIds: ["fork-knight"],
    },
    {
      id: "vault-approach-south",
      position: { x: 560, y: 450 },
      laneId: "shared",
      deniedTowerIds: ["fork-knight"],
    },
    {
      id: "vault-gate",
      position: { x: 800, y: 190 },
      laneId: "shared",
      deniedTowerIds: ["fork-knight"],
    },
    {
      id: "counting-house-ledge",
      position: { x: 900, y: 340 },
      laneId: "north-shore",
    },
  ],
  waves: [
    {
      name: "Ice Breakers",
      preview:
        "Both shores send steady goblin files to test which route the defense favors.",
      spawns: wave(
        group("basic-goblin", 24, 17),
        group("basic-goblin", 24, 17, 40, "south-shore"),
        group("basic-goblin", 22, 15, 820),
      ),
    },
    {
      name: "Chest on Ice",
      preview:
        "Express mimics sprint the marked mid-lake ice while goblin files keep both shores busy.",
      spawns: wave(
        group("basic-goblin", 22, 16),
        group("basic-goblin", 20, 16, 30, "south-shore"),
        group("fast-mimic", 10, 32, 460),
        group("fast-mimic", 10, 30, 500, "south-shore"),
        group("basic-goblin", 20, 14, 900),
      ),
    },
    {
      name: "Audit on Ice",
      preview:
        "Armored auditors anchor the south shore while mimics keep probing the north.",
      spawns: wave(
        group("basic-goblin", 22, 16),
        group("frozen-auditor", 6, 92, 260, "south-shore"),
        group("fast-mimic", 12, 28, 620),
        group("basic-goblin", 22, 14, 980),
        group("frozen-auditor", 5, 84, 1_320),
      ),
    },
    {
      name: "Cutting the Line",
      preview:
        "Slow-proof jumpers weave both shores at once, daring any single-lane defense.",
      spawns: wave(
        group("queue-jumper", 14, 30),
        group("queue-jumper", 14, 29, 40, "south-shore"),
        group("basic-goblin", 22, 15, 480),
        group("frozen-auditor", 6, 86, 860, "south-shore"),
        group("fast-mimic", 12, 26, 1_220),
      ),
    },
    {
      name: "Layaway Plan",
      preview:
        "Warded squires screen both merges while jumpers and mimics keep the shores honest.",
      spawns: wave(
        group("coupon-squire", 10, 42),
        group("coupon-squire", 10, 40, 30, "south-shore"),
        group("queue-jumper", 14, 28, 460),
        group("frozen-auditor", 6, 82, 820),
        group("fast-mimic", 14, 25, 1_180),
        group("basic-goblin", 20, 14, 1_500),
      ),
    },
    {
      name: "Cold Claims",
      preview:
        "The Warranty Wraiths debut, sliding arcane fire off entirely while a solid hit still lands.",
      spawns: wave(
        group("warranty-wraith", 8, 46),
        group("warranty-wraith", 8, 44, 40, "south-shore"),
        group("queue-jumper", 14, 27, 520),
        group("coupon-squire", 10, 38, 900),
        group("basic-goblin", 22, 14, 1_260),
        group("frozen-auditor", 6, 78, 1_620),
      ),
    },
    {
      name: "Vault Rush",
      preview:
        "Every threat crosses at once, converging hard on the three thin-ice merge pads.",
      spawns: wave(
        group("frozen-auditor", 7, 78),
        group("frozen-auditor", 6, 76, 30, "south-shore"),
        group("warranty-wraith", 8, 42, 420),
        group("queue-jumper", 16, 25, 780, "south-shore"),
        group("coupon-squire", 10, 36, 1_140),
        group("fast-mimic", 14, 24, 1_480),
        group("basic-goblin", 22, 13, 1_820),
      ),
    },
    {
      name: "The Thaw",
      preview:
        "A last full-roster surge splits between shores before the vault finally opens.",
      spawns: wave(
        group("warranty-wraith", 10, 40),
        group("frozen-auditor", 7, 74, 30, "south-shore"),
        group("queue-jumper", 16, 25, 420),
        group("coupon-squire", 12, 34, 780, "south-shore"),
        group("fast-mimic", 16, 23, 1_140),
        group("frozen-auditor", 7, 70, 1_480, "south-shore"),
        group("basic-goblin", 24, 13, 1_820),
      ),
    },
  ],
  mastery: [
    {
      id: "full-defense-roster",
      name: "Full Defense Roster",
      description: "Deploy all three tower types and win.",
      rule: { kind: "use-all-tower-types" },
    },
    {
      id: "warranty-void",
      name: "Warranty Void",
      description: "Win without letting a single Warranty Wraith leak.",
      rule: { kind: "no-leaks-of", enemyId: "warranty-wraith" },
    },
    {
      id: "skate-on-thin-ice",
      name: "Skate on Thin Ice",
      description: "Win a battle fought under Thin Ice.",
      rule: { kind: "victory-under-modifier", modifierId: "thin-ice" },
    },
  ],
  availableModifierIds: ["thin-ice"],
  rewardIds: ["wizard-actual-certification"],
};

export const departmentOfUnnecessaryBridgesLevel: LevelDefinition = {
  id: "department-of-unnecessary-bridges",
  name: "Department of Unnecessary Bridges",
  subtitle: "Two identical routes, three redundant islands, zero permits.",
  act: 2,
  order: 6,
  estimatedMinutes: 15,
  threatSummary:
    "Physical-resistant Frozen Asset Auditors use the south bridges while Middle Manager Mages accelerate priority convoys, capped by a hastening Comptroller General.",
  mechanicSummary:
    "Two routes demand simultaneous coverage. Telegraphed permit shutdowns pause the shared island pads, forcing distributed fallback coverage while resistant convoys cross south.",
  environment: {
    theme: "bureaucratic-bridges",
    decorIds: ["permit-booths", "bridge-piers", "filing-cabinets"],
    palette: { primary: 0x4c525c, secondary: 0x2c3037, accent: 0xd23d3d },
  },
  width: 960,
  height: 540,
  startingLives: 14,
  startingGold: 410,
  path: [
    { x: -36, y: 140 },
    { x: 300, y: 140 },
    { x: 300, y: 260 },
    { x: 560, y: 260 },
    { x: 560, y: 120 },
    { x: 820, y: 120 },
    { x: 820, y: 260 },
    { x: 996, y: 260 },
  ],
  routes: [
    {
      id: "north-route",
      path: [
        { x: -36, y: 140 },
        { x: 300, y: 140 },
        { x: 300, y: 260 },
        { x: 560, y: 260 },
        { x: 560, y: 120 },
        { x: 820, y: 120 },
        { x: 820, y: 260 },
        { x: 996, y: 260 },
      ],
    },
    {
      id: "south-route",
      path: [
        { x: -36, y: 400 },
        { x: 300, y: 400 },
        { x: 300, y: 280 },
        { x: 560, y: 280 },
        { x: 560, y: 420 },
        { x: 820, y: 420 },
        { x: 820, y: 260 },
        { x: 996, y: 260 },
      ],
    },
  ],
  pads: [
    {
      id: "north-tollgate",
      position: { x: 150, y: 90 },
      laneId: "north-route",
    },
    {
      id: "north-catwalk",
      position: { x: 420, y: 150 },
      laneId: "north-route",
    },
    {
      id: "north-overlook",
      position: { x: 900, y: 90 },
      laneId: "north-route",
    },
    {
      id: "south-tollgate",
      position: { x: 150, y: 470 },
      laneId: "south-route",
    },
    {
      id: "south-catwalk",
      position: { x: 420, y: 470 },
      laneId: "south-route",
    },
    {
      id: "island-permit-office",
      position: { x: 560, y: 190 },
      laneId: "shared",
      clusterId: "bridge-islands",
      shutdowns: [
        { waveIndex: 2, fromTick: 20, toTick: 75 },
        { waveIndex: 6, fromTick: 20, toTick: 75 },
      ],
    },
    {
      id: "island-checkpoint",
      position: { x: 690, y: 340 },
      laneId: "shared",
      clusterId: "bridge-islands",
      shutdowns: [
        { waveIndex: 4, fromTick: 20, toTick: 75 },
        { waveIndex: 7, fromTick: 20, toTick: 75 },
      ],
    },
  ],
  waves: [
    {
      name: "Ticket Booth Line",
      preview: "Both identical routes fill with orderly commuter files.",
      spawns: wave(
        group("basic-goblin", 18, 22),
        group("basic-goblin", 18, 22, 30, "south-route"),
        group("basic-goblin", 16, 19, 820),
      ),
    },
    {
      name: "Full Toll",
      preview:
        "Physical-resistant Frozen Asset Auditors take the south route while commuters keep the north busy.",
      spawns: wave(
        group("basic-goblin", 16, 20),
        group("frozen-auditor", 6, 94, 260, "south-route"),
        group("fast-mimic", 8, 34, 720),
        group("basic-goblin", 16, 18, 1_060),
      ),
    },
    {
      name: "Detour",
      preview:
        "The permit office posts its first telegraphed closure as jumpers weave both routes.",
      spawns: wave(
        group("queue-jumper", 10, 36),
        group("queue-jumper", 10, 35, 30, "south-route"),
        group("tax-troll", 5, 102, 520),
        group("basic-goblin", 16, 18, 900),
        group("fast-mimic", 9, 32, 1_260),
      ),
    },
    {
      name: "Middle Management",
      preview:
        "Priority target: Middle Manager Mages enter both routes, but the physical-resistant auditors they hasten stay on the south route.",
      spawns: wave(
        group("middle-manager-mage", 4, 76),
        group("middle-manager-mage", 4, 74, 30, "south-route"),
        group("frozen-auditor", 5, 86, 380, "south-route"),
        group("queue-jumper", 10, 33, 820),
        group("tax-troll", 5, 98, 1_220),
      ),
    },
    {
      name: "Bridge Traffic",
      preview:
        "The checkpoint island closes on schedule while both routes push mixed convoys.",
      spawns: wave(
        group("basic-goblin", 16, 19),
        group("middle-manager-mage", 4, 70, 30, "south-route"),
        group("tax-troll", 5, 96, 480),
        group("fast-mimic", 10, 31, 840),
        group("queue-jumper", 10, 32, 1_200),
      ),
    },
    {
      name: "Overlapping Shifts",
      preview:
        "Both routes surge at once, deliberately overlapping their pressure windows.",
      spawns: wave(
        group("queue-jumper", 12, 32),
        group("coupon-squire", 8, 48, 30, "south-route"),
        group("tax-troll", 5, 94, 460),
        group("basic-goblin", 16, 18, 820),
        group("fast-mimic", 10, 30, 1_180),
        group("queue-jumper", 12, 30, 1_520, "south-route"),
      ),
    },
    {
      name: "Red Tape Review",
      preview:
        "The permit office closes again as ordinary and physical-resistant auditors cross opposite routes.",
      spawns: wave(
        group("tax-troll", 5, 92),
        group("frozen-auditor", 5, 82, 30, "south-route"),
        group("queue-jumper", 12, 31, 480),
        group("basic-goblin", 18, 17, 840),
        group("fast-mimic", 11, 29, 1_200),
      ),
    },
    {
      name: "Audit Trail",
      preview:
        "The checkpoint island closes a final time behind a dense mixed formation.",
      spawns: wave(
        group("coupon-squire", 8, 46),
        group("tax-troll", 5, 90, 30, "south-route"),
        group("queue-jumper", 12, 30, 460),
        group("fast-mimic", 11, 28, 820),
        group("basic-goblin", 18, 17, 1_180),
      ),
    },
    {
      name: "The Comptroller General",
      preview:
        "Physical-resistant auditors hold the south bridge while the Comptroller advances north, then hastens with a Queue Jumper escort.",
      spawns: wave(
        group("basic-goblin", 18, 17),
        group("frozen-auditor", 9, 62, 240, "south-route"),
        group("queue-jumper", 12, 30, 720),
        group("coupon-squire", 8, 44, 1_060),
        group("comptroller-general", 1, 1, 1_400),
        group("fast-mimic", 11, 27, 1_420, "south-route"),
      ),
    },
  ],
  mastery: [
    {
      id: "no-tea-time",
      name: "No Tea Time",
      description: "Win without ever using Emergency Tea Break.",
      rule: { kind: "no-ability-used", abilityId: "emergency-tea-break" },
    },
    {
      id: "authorized-expenditure",
      name: "Authorized Expenditure",
      description: "Win after spending no more than 780 gold.",
      rule: { kind: "max-spent-gold", maxGold: 780 },
    },
    {
      id: "management-review",
      name: "Management Review",
      description:
        "Defeat every Middle Manager Mage before the battle reaches its halfway point.",
      rule: {
        kind: "enemy-cleared-before-half-battle",
        enemyId: "middle-manager-mage",
      },
    },
  ],
  availableModifierIds: ["red-tape"],
  rewardIds: [],
};

export const siegeAndDesistLevel: LevelDefinition = {
  id: "siege-and-desist",
  name: "Siege and Desist",
  subtitle: "The Act II finale. Cease, or don't.",
  act: 2,
  order: 7,
  estimatedMinutes: 16,
  threatSummary:
    "Physical-resistant auditors pressure the east flank while Refund Slimes split on the west, capped by a warded Queen who summons priority Middle Managers.",
  mechanicSummary:
    "Left and right flanks require separate opening coverage. The three shared keep pads shut down together on telegraphed waves, rewarding planned arcane or sonic cleanup on each flank.",
  environment: {
    theme: "siege-keep",
    decorIds: ["siege-towers", "banner-poles", "catapults"],
    palette: { primary: 0x5a4a2e, secondary: 0x2f271a, accent: 0xd4af37 },
  },
  width: 960,
  height: 540,
  startingLives: 14,
  startingGold: 330,
  path: [
    { x: -36, y: 150 },
    { x: 300, y: 150 },
    { x: 300, y: 400 },
    { x: 560, y: 400 },
    { x: 560, y: 150 },
    { x: 760, y: 150 },
    { x: 760, y: 270 },
    { x: 996, y: 270 },
  ],
  routes: [
    {
      id: "left-flank",
      path: [
        { x: -36, y: 150 },
        { x: 300, y: 150 },
        { x: 300, y: 400 },
        { x: 560, y: 400 },
        { x: 560, y: 150 },
        { x: 760, y: 150 },
        { x: 760, y: 270 },
        { x: 996, y: 270 },
      ],
    },
    {
      id: "right-flank",
      path: [
        { x: -36, y: 420 },
        { x: 300, y: 420 },
        { x: 300, y: 170 },
        { x: 560, y: 170 },
        { x: 560, y: 420 },
        { x: 760, y: 420 },
        { x: 760, y: 270 },
        { x: 996, y: 270 },
      ],
    },
  ],
  pads: [
    {
      id: "siege-ladder-west",
      position: { x: 150, y: 90 },
      laneId: "left-flank",
    },
    {
      id: "west-parapet",
      position: { x: 430, y: 330 },
      laneId: "left-flank",
    },
    {
      id: "west-rampart",
      position: { x: 630, y: 90 },
      laneId: "left-flank",
    },
    {
      id: "siege-ladder-east",
      position: { x: 150, y: 480 },
      laneId: "right-flank",
    },
    {
      id: "east-parapet",
      position: { x: 430, y: 250 },
      laneId: "right-flank",
    },
    {
      id: "east-rampart",
      position: { x: 630, y: 480 },
      laneId: "right-flank",
    },
    {
      id: "keep-drawbridge",
      position: { x: 850, y: 180 },
      laneId: "shared",
      clusterId: "keep-cluster",
      shutdowns: [
        { waveIndex: 3, fromTick: 20, toTick: 70 },
        { waveIndex: 5, fromTick: 20, toTick: 70 },
        { waveIndex: 7, fromTick: 20, toTick: 70 },
      ],
    },
    {
      id: "keep-barbican",
      position: { x: 880, y: 330 },
      laneId: "shared",
      clusterId: "keep-cluster",
      shutdowns: [
        { waveIndex: 3, fromTick: 20, toTick: 70 },
        { waveIndex: 5, fromTick: 20, toTick: 70 },
        { waveIndex: 7, fromTick: 20, toTick: 70 },
      ],
    },
    {
      id: "keep-standing-stone",
      position: { x: 940, y: 150 },
      laneId: "shared",
      clusterId: "keep-cluster",
      shutdowns: [
        { waveIndex: 3, fromTick: 20, toTick: 70 },
        { waveIndex: 5, fromTick: 20, toTick: 70 },
        { waveIndex: 7, fromTick: 20, toTick: 70 },
      ],
    },
  ],
  waves: [
    {
      name: "Ladders Up",
      preview: "Both flanks scale the walls with steady opening companies.",
      spawns: wave(
        group("basic-goblin", 24, 17),
        group("basic-goblin", 24, 17, 30, "right-flank"),
        group("basic-goblin", 20, 15, 820),
      ),
    },
    {
      name: "Siege Engines",
      preview:
        "Armored Trolls anchor the west while physical-resistant Frozen Asset Auditors and Mimics probe the east.",
      spawns: wave(
        group("basic-goblin", 22, 16),
        group("tax-troll", 7, 88, 260),
        group("frozen-auditor", 3, 88, 320, "right-flank"),
        group("fast-mimic", 10, 27, 760, "right-flank"),
        group("basic-goblin", 22, 14, 1_000),
      ),
    },
    {
      name: "Flanking Maneuvers",
      preview: "Slow-proof jumpers press both flanks at the same tempo.",
      spawns: wave(
        group("queue-jumper", 14, 29),
        group("queue-jumper", 14, 28, 30, "right-flank"),
        group("tax-troll", 6, 82, 480),
        group("basic-goblin", 22, 14, 860),
      ),
    },
    {
      name: "Warded Vanguard",
      preview:
        "Warded squires and guards lead as the keep cluster posts its first telegraphed shutdown.",
      spawns: wave(
        group("coupon-squire", 10, 40),
        group("bog-guard", 8, 46, 30, "right-flank"),
        group("queue-jumper", 14, 26, 460),
        group("tax-troll", 6, 78, 820),
        group("basic-goblin", 22, 13, 1_180),
      ),
    },
    {
      name: "Cold Reinforcements",
      preview:
        "Wraiths screen the west while a priority Middle Manager accelerates physical-resistant auditors east.",
      spawns: wave(
        group("warranty-wraith", 8, 44),
        group("middle-manager-mage", 5, 56, 30, "right-flank"),
        group("frozen-auditor", 6, 76, 220, "right-flank"),
        group("queue-jumper", 14, 25, 440),
        group("coupon-squire", 10, 36, 800),
        group("tax-troll", 6, 74, 1_160),
      ),
    },
    {
      name: "Refund Department",
      preview:
        "Refund Slimes debut, splitting into weaker goblins the instant they fall, as the keep cluster closes again.",
      spawns: wave(
        group("refund-slime", 5, 46),
        group("refund-slime", 4, 44, 30, "right-flank"),
        group("warranty-wraith", 8, 40, 460),
        group("bog-guard", 8, 42, 820, "right-flank"),
        group("basic-goblin", 22, 13, 1_180),
      ),
    },
    {
      name: "Full Muster",
      preview:
        "Every prior threat crosses in readable companies: resistant auditors east, splits west, and support at the merge.",
      spawns: wave(
        group("tax-troll", 7, 74),
        group("middle-manager-mage", 5, 50, 30, "right-flank"),
        group("frozen-auditor", 6, 72, 180, "right-flank"),
        group("queue-jumper", 16, 24, 420),
        group("refund-slime", 5, 42, 780),
        group("coupon-squire", 10, 34, 1_100, "right-flank"),
        group("fast-mimic", 14, 22, 1_420),
      ),
    },
    {
      name: "The Last Wall",
      preview:
        "The keep cluster shuts down a final time behind the heaviest formation yet.",
      spawns: wave(
        group("warranty-wraith", 8, 38),
        group("tax-troll", 7, 70, 30, "right-flank"),
        group("refund-slime", 5, 40, 420),
        group("queue-jumper", 16, 23, 780, "right-flank"),
        group("middle-manager-mage", 5, 46, 1_120),
        group("basic-goblin", 24, 12, 1_420),
      ),
    },
    {
      name: "Queen of Pending Litigation",
      preview:
        "Physical-resistant auditors contest the east before the warded Queen summons priority Middle Managers and sheds her ward for a fast final phase.",
      spawns: wave(
        group("bog-guard", 10, 44),
        group("frozen-auditor", 9, 58, 240, "right-flank"),
        group("refund-slime", 6, 38, 660),
        group("queue-jumper", 16, 22, 1_020, "right-flank"),
        group("queen-of-pending-litigation", 1, 1, 1_360),
      ),
    },
  ],
  mastery: [
    {
      id: "no-leaks-at-the-gate",
      name: "No Leaks at the Gate",
      description:
        "Win without letting a single enemy leak during the boss wave.",
      rule: { kind: "no-leaks-in-wave", waveIndex: 8 },
    },
    {
      id: "authorized-splits-only",
      name: "Authorized Splits Only",
      description:
        "Allow no more than 50 child claims to emerge from defeated Refund Slimes.",
      rule: { kind: "max-split-spawns", maxSplits: 50 },
    },
    {
      id: "skeleton-siege",
      name: "Skeleton Siege",
      description: "Win having placed no more than six towers.",
      rule: { kind: "max-towers-placed", maxTowers: 6 },
    },
  ],
  availableModifierIds: [],
  rewardIds: ["bardbarian-power-chord"],
};

export const lavaLampDistrictLevel: LevelDefinition = {
  id: "lava-lamp-district",
  name: "Lava Lamp District",
  subtitle: "Act III opens where the road itself is having a hot flash.",
  act: 3,
  order: 8,
  estimatedMinutes: 15,
  threatSummary:
    "Physical-resistant auditors cross during eruptions while Queue Jumpers, Managers, and Refund Slimes test each bend before the Lava Lamp Landlord hardens.",
  mechanicSummary:
    "Telegraphed eruptions expose each pool's pads and accelerate a marked road segment, requiring relocation before resistant convoys reach each hot bend.",
  environment: {
    theme: "lava-lamp-district",
    decorIds: ["lava-pool-west", "lava-pool-center", "lava-pool-east"],
    palette: { primary: 0x34213f, secondary: 0xd84a35, accent: 0xffc857 },
  },
  width: 960,
  height: 540,
  startingLives: 16,
  startingGold: 360,
  path: [
    { x: -36, y: 440 },
    { x: 190, y: 440 },
    { x: 190, y: 120 },
    { x: 430, y: 120 },
    { x: 430, y: 420 },
    { x: 680, y: 420 },
    { x: 680, y: 120 },
    { x: 996, y: 120 },
  ],
  speedZones: [
    {
      id: "west-hot-road",
      routeId: "main",
      fromPercent: 18,
      toPercent: 31,
      speedPercent: 145,
      activationHazardId: "west-eruption",
    },
    {
      id: "center-hot-road",
      routeId: "main",
      fromPercent: 45,
      toPercent: 58,
      speedPercent: 145,
      activationHazardId: "center-eruption",
    },
    {
      id: "final-center-hot-road",
      routeId: "main",
      fromPercent: 45,
      toPercent: 58,
      speedPercent: 145,
      activationHazardId: "final-center-eruption",
    },
    {
      id: "east-hot-road",
      routeId: "main",
      fromPercent: 72,
      toPercent: 86,
      speedPercent: 145,
      activationHazardId: "east-eruption",
    },
  ],
  environmentHazards: [
    {
      id: "west-eruption",
      kind: "eruption",
      name: "West Pool Eruption",
      description: "The west bend flashes before lava crosses the road.",
      waveIndex: 2,
      telegraphFromTick: 110,
      activeFromTick: 190,
      activeToTick: 510,
      exposedPadIds: ["west-inside", "west-outside"],
      speedZoneIds: ["west-hot-road"],
    },
    {
      id: "center-eruption",
      kind: "eruption",
      name: "Central Pool Eruption",
      description: "The central switchback glows before it erupts.",
      waveIndex: 4,
      telegraphFromTick: 170,
      activeFromTick: 250,
      activeToTick: 590,
      exposedPadIds: ["center-inside", "center-outside"],
      speedZoneIds: ["center-hot-road"],
    },
    {
      id: "east-eruption",
      kind: "eruption",
      name: "East Pool Eruption",
      description: "The final bend signals its eruption in advance.",
      waveIndex: 6,
      telegraphFromTick: 220,
      activeFromTick: 300,
      activeToTick: 650,
      exposedPadIds: ["east-inside", "east-outside"],
      speedZoneIds: ["east-hot-road"],
    },
    {
      id: "final-center-eruption",
      kind: "eruption",
      name: "Central Encore",
      description: "The central pool repeats its learned warning pattern.",
      waveIndex: 7,
      telegraphFromTick: 500,
      activeFromTick: 580,
      activeToTick: 900,
      exposedPadIds: ["center-inside", "center-outside"],
      speedZoneIds: ["final-center-hot-road"],
    },
  ],
  pads: [
    {
      id: "west-inside",
      position: { x: 245, y: 365 },
      laneId: "main",
      clusterId: "west-pool",
    },
    {
      id: "west-outside",
      position: { x: 120, y: 270 },
      laneId: "main",
      clusterId: "west-pool",
    },
    {
      id: "center-inside",
      position: { x: 365, y: 205 },
      laneId: "main",
      clusterId: "center-pool",
    },
    {
      id: "center-outside",
      position: { x: 500, y: 265 },
      laneId: "main",
      clusterId: "center-pool",
    },
    {
      id: "east-inside",
      position: { x: 615, y: 350 },
      laneId: "main",
      clusterId: "east-pool",
    },
    {
      id: "east-outside",
      position: { x: 745, y: 275 },
      laneId: "main",
      clusterId: "east-pool",
    },
    { id: "entry-bend", position: { x: 90, y: 485 }, laneId: "main" },
    { id: "exit-bend", position: { x: 825, y: 75 }, laneId: "main" },
  ],
  waves: [
    {
      name: "Warm Reception",
      preview: "Goblin files and Queue Jumpers learn the S-bends.",
      spawns: pacedWave(
        157,
        group("basic-goblin", 30, 18),
        group("queue-jumper", 12, 30, 280),
        group("basic-goblin", 22, 14, 650),
      ),
    },
    {
      name: "Warranty Heat",
      preview: "Wraiths screen a fast second column.",
      spawns: pacedWave(
        157,
        group("warranty-wraith", 10, 42),
        group("queue-jumper", 18, 27, 280),
        group("basic-goblin", 26, 14, 680),
      ),
    },
    {
      name: "West Pool Warning",
      preview:
        "The west eruption closes exposed pads as physical-resistant auditors enter the hot road.",
      spawns: pacedWave(
        157,
        group("frozen-auditor", 8, 52),
        group("coupon-squire", 8, 34, 260),
        group("queue-jumper", 20, 25, 300),
        group("warranty-wraith", 10, 38, 690),
      ),
    },
    {
      name: "Management Melt",
      preview: "Middle Manager auras pull armored Trolls through the bends.",
      spawns: pacedWave(
        157,
        group("middle-manager-mage", 7, 62),
        group("tax-troll", 10, 66, 180),
        group("basic-goblin", 30, 13, 650),
      ),
    },
    {
      name: "Central Boil",
      preview:
        "Physical-resistant auditors screen Refund Slimes through the central eruption and its split cleanup.",
      spawns: pacedWave(
        157,
        group("frozen-auditor", 7, 54),
        group("refund-slime", 9, 43, 220),
        group("warranty-wraith", 10, 39, 260),
        group("queue-jumper", 20, 23, 610),
      ),
    },
    {
      name: "Claims Conveyor",
      preview: "Wraith resistance and Slime splits alternate down the S.",
      spawns: pacedWave(
        157,
        group("warranty-wraith", 14, 36),
        group("refund-slime", 12, 39, 260),
        group("tax-troll", 9, 62, 650),
      ),
    },
    {
      name: "East Pool Rush",
      preview:
        "Priority Managers accelerate physical-resistant auditors and Queue Jumpers through the final hot road.",
      spawns: pacedWave(
        157,
        group("middle-manager-mage", 8, 54),
        group("frozen-auditor", 8, 50, 140),
        group("queue-jumper", 28, 21, 170),
        group("coupon-squire", 14, 31, 690),
      ),
    },
    {
      name: "Landlord's Liquidation",
      preview:
        "Boss: resistant auditors cross the central encore before the warded Landlord hardens, then races with split reinforcements.",
      spawns: pacedWave(
        157,
        group("middle-manager-mage", 7, 50),
        group("queue-jumper", 24, 22, 120),
        group("frozen-auditor", 9, 56, 500),
        group("refund-slime", 10, 38, 800),
        group("lava-lamp-landlord", 1, 1, 1_120),
      ),
    },
  ],
  mastery: [
    {
      id: "eruption-proof",
      name: "Eruption Proof",
      description: "Win with no leaks during an active eruption window.",
      rule: { kind: "no-leaks-during-environment-hazards" },
    },
    {
      id: "respect-the-rope",
      name: "Respect the Rope",
      description: "Win without occupying a pad while it is exposed.",
      rule: { kind: "no-exposed-pad-uses" },
    },
    {
      id: "hot-seat",
      name: "Hot Seat",
      description: "Win under the Hot Seat challenge.",
      rule: { kind: "victory-under-modifier", modifierId: "hot-seat" },
    },
  ],
  availableModifierIds: ["hot-seat"],
  rewardIds: ["hot-seat-challenge"],
};

export const necromancersNetworkingEventLevel: LevelDefinition = {
  id: "necromancers-networking-event",
  name: "Necromancers' Networking Event",
  subtitle: "Every introduction comes with one follow-up.",
  act: 3,
  order: 9,
  estimatedMinutes: 16,
  threatSummary:
    "Marked waves refer their first defeated non-boss at half health; physical-resistant auditors and split claims return under priority Middle Manager support.",
  mechanicSummary:
    "Two entrances require simultaneous coverage before a no-build ballroom and late merge. Referrals are spectral, one-shot, and cannot refer themselves.",
  environment: {
    theme: "necromancer-ballroom",
    decorIds: ["no-build-dance-floor", "spectral-banners", "exit-coat-check"],
    palette: { primary: 0x241c38, secondary: 0x694f8e, accent: 0xa8f0d0 },
  },
  width: 960,
  height: 540,
  startingLives: 16,
  startingGold: 620,
  path: [
    { x: -36, y: -30 },
    { x: 180, y: 90 },
    { x: 390, y: 270 },
    { x: 650, y: 270 },
    { x: 790, y: 400 },
    { x: 996, y: 400 },
  ],
  routes: [
    {
      id: "northwest-invite",
      path: [
        { x: -36, y: -30 },
        { x: 180, y: 90 },
        { x: 390, y: 270 },
        { x: 650, y: 270 },
        { x: 790, y: 400 },
        { x: 996, y: 400 },
      ],
    },
    {
      id: "southwest-plus-one",
      path: [
        { x: -36, y: 570 },
        { x: 180, y: 450 },
        { x: 390, y: 270 },
        { x: 650, y: 270 },
        { x: 790, y: 400 },
        { x: 996, y: 400 },
      ],
    },
  ],
  pads: [
    {
      id: "north-door",
      position: { x: 115, y: 55 },
      laneId: "northwest-invite",
    },
    {
      id: "south-door",
      position: { x: 115, y: 485 },
      laneId: "southwest-plus-one",
    },
    {
      id: "north-band",
      position: { x: 275, y: 105 },
      laneId: "northwest-invite",
    },
    {
      id: "south-band",
      position: { x: 275, y: 435 },
      laneId: "southwest-plus-one",
    },
    { id: "coat-check", position: { x: 690, y: 350 }, laneId: "shared" },
    { id: "last-handshake", position: { x: 825, y: 325 }, laneId: "shared" },
    {
      id: "north-wall",
      position: { x: 500, y: 120 },
      laneId: "northwest-invite",
    },
    {
      id: "south-wall",
      position: { x: 500, y: 420 },
      laneId: "southwest-plus-one",
    },
  ],
  waves: [
    {
      name: "Name Tags",
      preview: "Two ordinary goblin guest lists cross the ballroom.",
      spawns: pacedWave(
        170,
        group("basic-goblin", 28, 18, 0, "northwest-invite"),
        group("basic-goblin", 28, 18, 20, "southwest-plus-one"),
      ),
    },
    {
      name: "Speed Networking",
      preview: "Mimics and Queue Jumpers trade opposite corners.",
      spawns: pacedWave(
        170,
        group("fast-mimic", 18, 28, 0, "northwest-invite"),
        group("queue-jumper", 18, 28, 20, "southwest-plus-one"),
        group("basic-goblin", 24, 14, 650),
      ),
    },
    {
      name: "First Referral",
      preview:
        "Marked: whichever non-boss falls first returns once at half health; watch its resistance and finish the referral.",
      referral: { reviveHealthPercent: 50 },
      spawns: pacedWave(
        170,
        group("frozen-auditor", 10, 42, 0, "northwest-invite"),
        group("coupon-squire", 8, 36, 380, "northwest-invite"),
        group("warranty-wraith", 10, 44, 30, "southwest-plus-one"),
        group("queue-jumper", 18, 25, 620),
      ),
    },
    {
      name: "Management Circle",
      preview: "Middle Managers accelerate mirrored Troll formations.",
      spawns: pacedWave(
        170,
        group("middle-manager-mage", 6, 58, 0, "northwest-invite"),
        group("tax-troll", 9, 70, 120, "northwest-invite"),
        group("middle-manager-mage", 6, 58, 20, "southwest-plus-one"),
        group("tax-troll", 9, 70, 140, "southwest-plus-one"),
      ),
    },
    {
      name: "Claims Follow-Up",
      preview:
        "Marked: resistant auditors lead northwest while Slimes split on both routes; the first non-boss defeated also returns.",
      referral: { reviveHealthPercent: 50 },
      spawns: pacedWave(
        170,
        group("frozen-auditor", 8, 48, 0, "northwest-invite"),
        group("refund-slime", 10, 42, 240, "northwest-invite"),
        group("refund-slime", 10, 42, 20, "southwest-plus-one"),
        group("warranty-wraith", 12, 38, 610),
      ),
    },
    {
      name: "Crossed Calendars",
      preview:
        "Wraiths and warded guards swap lanes across the no-build floor.",
      spawns: pacedWave(
        170,
        group("warranty-wraith", 15, 38, 0, "northwest-invite"),
        group("bog-guard", 14, 40, 20, "southwest-plus-one"),
        group("queue-jumper", 22, 23, 620),
      ),
    },
    {
      name: "Executive Introduction",
      preview:
        "Marked: physical-resistant auditors and warded guests meet an aura-supported merge.",
      referral: { reviveHealthPercent: 50 },
      spawns: pacedWave(
        170,
        group("middle-manager-mage", 8, 52, 0, "northwest-invite"),
        group("frozen-auditor", 11, 56, 100, "northwest-invite"),
        group("coupon-squire", 18, 31, 20, "southwest-plus-one"),
        group("queue-jumper", 22, 22, 650, "southwest-plus-one"),
      ),
    },
    {
      name: "Open Mixer",
      preview: "Every resistance profile reaches the shared coat check.",
      spawns: pacedWave(
        170,
        group("warranty-wraith", 16, 36, 0, "northwest-invite"),
        group("refund-slime", 14, 38, 20, "southwest-plus-one"),
        group("tax-troll", 12, 60, 420),
        group("middle-manager-mage", 8, 48, 700, "southwest-plus-one"),
      ),
    },
    {
      name: "Referral Capstone",
      preview:
        "Marked: the first non-boss defeated returns while priority Middle Managers support both routes.",
      referral: { reviveHealthPercent: 50 },
      spawns: pacedWave(
        170,
        group("frozen-auditor", 13, 54, 0, "northwest-invite"),
        group("warranty-wraith", 16, 35, 20, "southwest-plus-one"),
        group("middle-manager-mage", 10, 46, 300),
        group("middle-manager-mage", 10, 46, 320, "southwest-plus-one"),
        group("queue-jumper", 24, 21, 760),
      ),
    },
  ],
  mastery: [
    {
      id: "short-reference",
      name: "Short Reference",
      description: "Defeat every referred enemy before it reaches halfway.",
      rule: { kind: "no-referred-enemy-reaches-halfway" },
    },
    {
      id: "six-degrees",
      name: "Six Degrees",
      description: "Win having placed at most six towers.",
      rule: { kind: "max-towers-placed", maxTowers: 6 },
    },
    {
      id: "referral-only",
      name: "Referral Only",
      description: "Win under the Referral Only challenge.",
      rule: { kind: "victory-under-modifier", modifierId: "referral-only" },
    },
  ],
  availableModifierIds: ["referral-only"],
  rewardIds: ["referral-only-challenge"],
};

export const quarterlyDragonReviewLevel: LevelDefinition = {
  id: "quarterly-dragon-review",
  name: "Quarterly Dragon Review",
  subtitle: "The final gate has three entrances and one very senior reviewer.",
  act: 3,
  order: 10,
  estimatedMinutes: 18,
  threatSummary:
    "Warehouse, courtyard, and executive-tunnel formations exercise every roster role before the Dragon Intern and the three-stage Chief Executive Dragon.",
  mechanicSummary:
    "Three routes converge at one final gate. Waves 7-9 foreground armor, speed/control resistance, and aura/split counters before wave 10 combines those readable roles.",
  environment: {
    theme: "quarterly-review-campus",
    decorIds: [
      "warehouse",
      "review-courtyard",
      "executive-tunnel",
      "final-gate",
    ],
    palette: { primary: 0x263044, secondary: 0x783f4f, accent: 0xf2c14e },
  },
  width: 960,
  height: 540,
  startingLives: 18,
  startingGold: 760,
  path: [
    { x: -36, y: 90 },
    { x: 260, y: 90 },
    { x: 440, y: 270 },
    { x: 720, y: 270 },
    { x: 840, y: 360 },
    { x: 996, y: 360 },
  ],
  routes: [
    {
      id: "warehouse",
      path: [
        { x: -36, y: 90 },
        { x: 260, y: 90 },
        { x: 440, y: 270 },
        { x: 720, y: 270 },
        { x: 840, y: 360 },
        { x: 996, y: 360 },
      ],
    },
    {
      id: "courtyard",
      path: [
        { x: -36, y: 450 },
        { x: 260, y: 450 },
        { x: 440, y: 270 },
        { x: 720, y: 270 },
        { x: 840, y: 360 },
        { x: 996, y: 360 },
      ],
    },
    {
      id: "executive-tunnel",
      path: [
        { x: -36, y: 270 },
        { x: 170, y: 270 },
        { x: 170, y: -36 },
        { x: 360, y: -36 },
        { x: 360, y: 150 },
        { x: 520, y: 270 },
        { x: 720, y: 270 },
        { x: 840, y: 360 },
        { x: 996, y: 360 },
      ],
    },
  ],
  pads: [
    { id: "warehouse-door", position: { x: 100, y: 145 }, laneId: "warehouse" },
    { id: "warehouse-rack", position: { x: 270, y: 155 }, laneId: "warehouse" },
    { id: "courtyard-door", position: { x: 100, y: 395 }, laneId: "courtyard" },
    { id: "courtyard-dais", position: { x: 270, y: 385 }, laneId: "courtyard" },
    {
      id: "tunnel-desk",
      position: { x: 420, y: 65 },
      laneId: "executive-tunnel",
    },
    {
      id: "tunnel-lamp",
      position: { x: 485, y: 180 },
      laneId: "executive-tunnel",
    },
    { id: "review-left", position: { x: 520, y: 350 }, laneId: "shared" },
    { id: "review-right", position: { x: 650, y: 190 }, laneId: "shared" },
    { id: "gate-north", position: { x: 785, y: 250 }, laneId: "shared" },
    { id: "gate-south", position: { x: 870, y: 430 }, laneId: "shared" },
  ],
  waves: [
    {
      name: "Attendance",
      preview: "Basic staff enter through all three review routes.",
      spawns: pacedWave(
        220,
        group("basic-goblin", 24, 18, 0, "warehouse"),
        group("basic-goblin", 24, 18, 20, "courtyard"),
        group("basic-goblin", 20, 20, 40, "executive-tunnel"),
      ),
    },
    {
      name: "Expedited Agenda",
      preview: "Mimics and Queue Jumpers test speed coverage lane by lane.",
      spawns: pacedWave(
        220,
        group("fast-mimic", 18, 27, 0, "warehouse"),
        group("queue-jumper", 18, 27, 20, "courtyard"),
        group("coupon-squire", 14, 34, 40, "executive-tunnel"),
      ),
    },
    {
      name: "Protected Statements",
      preview: "Wards and magic-resistant Wraiths demand mixed damage.",
      spawns: pacedWave(
        220,
        group("coupon-squire", 16, 34, 0, "warehouse"),
        group("warranty-wraith", 14, 38, 20, "courtyard"),
        group("bog-guard", 12, 42, 40, "executive-tunnel"),
      ),
    },
    {
      name: "Audited Inventory",
      preview:
        "Ordinary Tax Trolls and physical-resistant Frozen Asset Auditors split the warehouse and courtyard.",
      spawns: pacedWave(
        220,
        group("tax-troll", 12, 64, 0, "warehouse"),
        group("frozen-auditor", 12, 64, 20, "courtyard"),
        group("queue-jumper", 20, 23, 300, "executive-tunnel"),
      ),
    },
    {
      name: "Delegated Momentum",
      preview: "Middle Manager auras accelerate three readable formations.",
      spawns: pacedWave(
        220,
        group("middle-manager-mage", 7, 54, 0, "warehouse"),
        group("basic-goblin", 28, 14, 100, "warehouse"),
        group("middle-manager-mage", 7, 54, 20, "courtyard"),
        group("queue-jumper", 22, 22, 120, "courtyard"),
        group("warranty-wraith", 12, 36, 400, "executive-tunnel"),
      ),
    },
    {
      name: "Refund Forecast",
      preview: "Refund Slimes make splash cleanup the foreground concern.",
      spawns: pacedWave(
        220,
        group("refund-slime", 14, 38, 0, "warehouse"),
        group("refund-slime", 14, 38, 20, "courtyard"),
        group("warranty-wraith", 14, 36, 320, "executive-tunnel"),
      ),
    },
    {
      name: "Armor Counter: Intern Review",
      preview:
        "Foreground counter: armor answers the warehouse while the returning Dragon Intern arrives early as a miniboss.",
      spawns: pacedWave(
        220,
        group("tax-troll", 15, 58, 0, "warehouse"),
        group("dragon-intern", 1, 1, 420, "courtyard"),
        group("middle-manager-mage", 8, 48, 200, "executive-tunnel"),
      ),
    },
    {
      name: "Control Counter: Fast Track",
      preview:
        "Foreground counter: slow-immune Queue Jumpers and Wraith resistance require coverage and physical answers.",
      spawns: pacedWave(
        220,
        group("queue-jumper", 30, 20, 0, "warehouse"),
        group("warranty-wraith", 18, 34, 20, "courtyard"),
        group("coupon-squire", 18, 29, 200, "executive-tunnel"),
      ),
    },
    {
      name: "Density Counter: Reforecast",
      preview:
        "Foreground counter: aura-supported Slime splits reward splash and disciplined merge coverage.",
      spawns: pacedWave(
        220,
        group("middle-manager-mage", 10, 46, 0, "warehouse"),
        group("refund-slime", 18, 34, 120, "warehouse"),
        group("middle-manager-mage", 10, 46, 20, "courtyard"),
        group("refund-slime", 18, 34, 140, "courtyard"),
        group("tax-troll", 12, 56, 500, "executive-tunnel"),
      ),
    },
    {
      name: "Chief Executive Dragon",
      preview:
        "All readable roles combine without hidden inflation, including physical-resistant auditors. The Chief opens warded with escorts, enters an armored main review, then rages and calls exactly one final reinforcement.",
      spawns: pacedWave(
        220,
        group("frozen-auditor", 10, 58, 0, "warehouse"),
        group("warranty-wraith", 12, 34, 20, "courtyard"),
        group("queue-jumper", 20, 21, 180, "executive-tunnel"),
        group("refund-slime", 12, 34, 450, "warehouse"),
        group("middle-manager-mage", 8, 46, 580, "courtyard"),
        group("chief-executive-dragon", 1, 1, 900, "executive-tunnel"),
      ),
    },
  ],
  mastery: [
    {
      id: "clean-quarter",
      name: "Clean Quarter",
      description: "Win without a single leak.",
      rule: { kind: "no-leaks" },
    },
    {
      id: "under-budget-review",
      name: "Under Budget Review",
      description: "Win while spending no more than 1,650 gold.",
      rule: { kind: "max-spent-gold", maxGold: 1_650 },
    },
    {
      id: "executive-mandate",
      name: "Executive Mandate",
      description: "Win under the Executive Mandate challenge.",
      rule: {
        kind: "victory-under-modifier",
        modifierId: "executive-mandate",
      },
    },
  ],
  availableModifierIds: ["executive-mandate"],
  rewardIds: [
    "executive-mandate-challenge",
    "campaign-epilogue",
    "completion-crest",
    "executive-palette",
  ],
};

export const levelDefinitions = {
  "muddy-moat": muddyMoatLevel,
  "mimic-market": mimicMarketLevel,
  "troll-tollway": trollTollwayLevel,
  "castle-hassle": castleHassleLevel,
  "frozen-assets": frozenAssetsLevel,
  "department-of-unnecessary-bridges": departmentOfUnnecessaryBridgesLevel,
  "siege-and-desist": siegeAndDesistLevel,
  "lava-lamp-district": lavaLampDistrictLevel,
  "necromancers-networking-event": necromancersNetworkingEventLevel,
  "quarterly-dragon-review": quarterlyDragonReviewLevel,
} as const satisfies Record<string, LevelDefinition>;

export const fullBossEncounterDefinitions = [
  {
    levelId: "mimic-market",
    enemyId: "grand-till-mimic",
    cadence: "regular",
  },
  {
    levelId: "castle-hassle",
    enemyId: "baron-von-bog",
    cadence: "regular",
  },
  {
    levelId: "department-of-unnecessary-bridges",
    enemyId: "comptroller-general",
    cadence: "regular",
  },
  {
    levelId: "siege-and-desist",
    enemyId: "queen-of-pending-litigation",
    cadence: "act-finale-exception",
  },
  {
    levelId: "lava-lamp-district",
    enemyId: "lava-lamp-landlord",
    cadence: "regular",
  },
  {
    levelId: "quarterly-dragon-review",
    enemyId: "chief-executive-dragon",
    cadence: "regular",
  },
] as const satisfies readonly FullBossEncounterDefinition[];

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
  {
    id: "frozen-assets",
    levelId: "frozen-assets",
    name: "Frozen Assets",
    description: "Act II opens on a lake that legally isn't liquid.",
    position: { x: 78, y: 70 },
    act: 2,
    order: 5,
    unlock: "victory",
    unlockSourceId: "castle-hassle",
    unlockConditions: [{ kind: "victory", levelId: "castle-hassle" }],
    rewardIds: ["wizard-actual-certification"],
  },
  {
    id: "department-of-unnecessary-bridges",
    levelId: "department-of-unnecessary-bridges",
    name: "Department of Unnecessary Bridges",
    description: "Two identical routes, three redundant islands, zero permits.",
    position: { x: 55, y: 82 },
    act: 2,
    order: 6,
    unlock: "victory",
    unlockSourceId: "frozen-assets",
    unlockConditions: [{ kind: "victory", levelId: "frozen-assets" }],
    rewardIds: [],
  },
  {
    id: "siege-and-desist",
    levelId: "siege-and-desist",
    name: "Siege and Desist",
    description: "The Act II finale. Cease, or don't.",
    position: { x: 30, y: 78 },
    act: 2,
    order: 7,
    unlock: "victory",
    unlockSourceId: "department-of-unnecessary-bridges",
    unlockConditions: [
      { kind: "victory", levelId: "department-of-unnecessary-bridges" },
    ],
    rewardIds: ["bardbarian-power-chord"],
  },
  {
    id: "lava-lamp-district",
    levelId: "lava-lamp-district",
    name: "Lava Lamp District",
    description: "Three pools, one S-road, and a very literal hot seat.",
    position: { x: 12, y: 90 },
    act: 3,
    order: 8,
    unlock: "victory",
    unlockSourceId: "siege-and-desist",
    unlockConditions: [{ kind: "victory", levelId: "siege-and-desist" }],
    rewardIds: ["hot-seat-challenge"],
  },
  {
    id: "necromancers-networking-event",
    levelId: "necromancers-networking-event",
    name: "Necromancers' Networking Event",
    description: "The first follow-up is always spectral.",
    position: { x: 12, y: 80 },
    act: 3,
    order: 9,
    unlock: "victory",
    unlockSourceId: "lava-lamp-district",
    unlockConditions: [{ kind: "victory", levelId: "lava-lamp-district" }],
    rewardIds: ["referral-only-challenge"],
  },
  {
    id: "quarterly-dragon-review",
    levelId: "quarterly-dragon-review",
    name: "Quarterly Dragon Review",
    description: "Three routes converge on one final performance review.",
    position: { x: 12, y: 70 },
    act: 3,
    order: 10,
    unlock: "victory",
    unlockSourceId: "necromancers-networking-event",
    unlockConditions: [
      { kind: "victory", levelId: "necromancers-networking-event" },
    ],
    rewardIds: [
      "executive-mandate-challenge",
      "campaign-epilogue",
      "completion-crest",
      "executive-palette",
    ],
  },
];
