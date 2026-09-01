import type {
  CampaignNodeDefinition,
  EnemyDefinition,
  LevelDefinition,
  ModifierDefinition,
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
    levels: [
      { damage: 24, range: 126, cooldownTicks: 16, upgradeCost: 52 },
      { damage: 38, range: 138, cooldownTicks: 14, upgradeCost: 85 },
      { damage: 58, range: 152, cooldownTicks: 12, upgradeCost: null },
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
  },
} as const satisfies Record<string, ModifierDefinition>;

export const muddyMoatLevel: LevelDefinition = {
  id: "muddy-moat",
  name: "The Muddy Moat",
  subtitle: "An aggressively damp tutorial in six regrettable acts.",
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
    },
    {
      id: "balanced-party",
      name: "Balanced-ish Party",
      description: "Deploy all three tower types and win.",
    },
    {
      id: "royal-accounting",
      name: "Royal Accounting",
      description: "Win after spending no more than 620 gold.",
    },
  ],
  availableModifierIds: ["stingy-king"],
};

export const levelDefinitions = {
  [muddyMoatLevel.id]: muddyMoatLevel,
} as const satisfies Record<string, LevelDefinition>;

export const campaignNodes: readonly CampaignNodeDefinition[] = [
  {
    id: "muddy-moat",
    levelId: "muddy-moat",
    name: "The Muddy Moat",
    description: "Playable now. Boots not included.",
    position: { x: 18, y: 55 },
    unlock: "start",
    unlockSourceId: null,
  },
  {
    id: "mimic-market",
    levelId: null,
    name: "Mimic Market",
    description: "Preview branch: retail bites back.",
    position: { x: 55, y: 25 },
    unlock: "victory",
    unlockSourceId: "muddy-moat",
  },
  {
    id: "troll-tollway",
    levelId: null,
    name: "Troll Tollway",
    description:
      "Preview branch: opened by mastering the Stingy King's budget.",
    position: { x: 78, y: 70 },
    unlock: "modifier",
    unlockSourceId: "stingy-king",
  },
];
