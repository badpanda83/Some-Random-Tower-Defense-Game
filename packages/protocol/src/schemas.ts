import { z } from "zod";

export const CONTENT_VERSION = 4 as const;
export const LEGACY_CONTENT_VERSION = 1 as const;
export const PREVIOUS_CONTENT_VERSION = 2 as const;
export const ACT_THREE_CONTENT_VERSION = 3 as const;
export const EQUIPMENT_RULES_VERSION = 1 as const;
export const DEFAULT_SAVE_SLOT = "campaign" as const;

const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const opaqueIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._:-]+$/);
const counterSchema = z.number().int().min(0).max(100_000_000);

export const defenderIdSchema = z.enum([
  "fork-knight",
  "discount-wizard",
  "bardbarian",
]);
export const equipmentSlotSchema = z.enum(["weapon", "armor", "charm"]);
export const equipmentRaritySchema = z.enum([
  "C",
  "B",
  "A",
  "S",
  "S+",
  "S++",
  "S+++",
]);

export const defenderLoadoutSchema = z.object({
  weapon: idSchema.nullable(),
  armor: idSchema.nullable(),
  charm: idSchema.nullable(),
});

export const loadoutSnapshotSchema = z.object({
  "fork-knight": defenderLoadoutSchema,
  "discount-wizard": defenderLoadoutSchema,
  bardbarian: defenderLoadoutSchema,
});

export const EMPTY_LOADOUTS = {
  "fork-knight": { weapon: null, armor: null, charm: null },
  "discount-wizard": { weapon: null, armor: null, charm: null },
  bardbarian: { weapon: null, armor: null, charm: null },
} as const;

export const gameSpeedSchema = z.union([z.literal(1), z.literal(2)]);

export const settingsSchema = z.object({
  muted: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  lowEffects: z.boolean().default(false),
  gameSpeed: gameSpeedSchema.default(1),
  keepPlayingWhileAway: z.boolean().default(false),
});

export const towerPlacementSchema = z.object({
  id: idSchema,
  towerId: idSchema,
  padId: idSchema,
  level: z.number().int().min(1).max(4),
  investedGold: z.number().int().min(0).max(999_999).optional(),
});

export const equipmentContributionSchema = z.object({
  procCount: counterSchema,
  directBonusDamage: counterSchema,
  echoDamage: counterSchema,
  controlTicksApplied: counterSchema,
  controlTicksRejected: counterSchema,
  goldSaved: counterSchema,
  lifeDamagePrevented: counterSchema,
  teamBuffUptimeTicks: counterSchema,
});

export const equipmentMetricsSchema = z.record(
  idSchema,
  equipmentContributionSchema,
);

export const equipmentProcStateSchema = z.object({
  counters: z.record(opaqueIdSchema, counterSchema),
  cooldownUntilTicks: z.record(opaqueIdSchema, counterSchema),
  oncePerWaveIds: z.array(opaqueIdSchema).max(200),
  oncePerBattleIds: z.array(opaqueIdSchema).max(200),
  teamCooldownUntilTicks: z.record(opaqueIdSchema, counterSchema),
  targetCaps: z.record(opaqueIdSchema, counterSchema),
  activeBuffUntilTicks: z.record(opaqueIdSchema, counterSchema),
});

export const EMPTY_EQUIPMENT_PROC_STATE = {
  counters: {},
  cooldownUntilTicks: {},
  oncePerWaveIds: [],
  oncePerBattleIds: [],
  teamCooldownUntilTicks: {},
  targetCaps: {},
  activeBuffUntilTicks: {},
} as const;

export const battleCheckpointSchema = z.object({
  levelId: idSchema,
  seed: z.number().int().min(1).max(2_147_483_647),
  modifierIds: z.array(idSchema).max(8),
  tick: counterSchema,
  nextWave: z.number().int().min(0).max(100),
  lives: z.number().int().min(1).max(999),
  gold: z.number().int().min(0).max(999_999),
  score: z.number().int().min(0).max(10_000_000),
  spawnedEnemies: z.number().int().min(0).max(100_000),
  attemptId: opaqueIdSchema.optional(),
  loadoutSnapshot: loadoutSnapshotSchema.optional(),
  rngState: z
    .object({
      spawn: z.number().int().min(1).max(4_294_967_295),
      combat: z.number().int().min(1).max(4_294_967_295),
    })
    .optional(),
  equipmentProcState: equipmentProcStateSchema.optional(),
  abilityChargeTicks: z.number().int().min(0).max(10_000).optional(),
  teaBreakUsedThisWave: z.boolean().optional(),
  placements: z.array(towerPlacementSchema).max(40),
  metrics: z.object({
    spentGold: z.number().int().min(0).max(999_999),
    authoredSpentGold: z.number().int().min(0).max(999_999).optional(),
    leakedEnemies: z.number().int().min(0).max(9999),
    leakedByEnemyId: z
      .record(idSchema, z.number().int().min(0).max(9999))
      .optional(),
    leakedByWaveIndex: z
      .record(idSchema, z.number().int().min(0).max(9999))
      .optional(),
    soldTowers: z.number().int().min(0).max(9999),
    usedTowerIds: z.array(idSchema).max(40),
    maxTowersPlaced: z.number().int().min(0).max(999).optional(),
    bossDefeatPathPercent: z
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .optional(),
    defeatedBossEnemyIds: z.array(idSchema).max(20).optional(),
    splitSpawns: z.number().int().min(0).max(999_999).optional(),
    abilityActivations: z
      .record(idSchema, z.number().int().min(0).max(9999))
      .optional(),
    lastEnemyClearedTick: z.record(idSchema, counterSchema).optional(),
    leaksDuringEnvironmentHazards: z.number().int().min(0).max(9999).optional(),
    exposedPadUses: z.number().int().min(0).max(9999).optional(),
    referredEnemiesReachedHalfway: z.number().int().min(0).max(9999).optional(),
    referredWaveIndices: z.array(z.number().int().min(0).max(100)).optional(),
    bossReinforcementCalls: z
      .record(idSchema, z.number().int().min(0).max(9999))
      .optional(),
    equipment: equipmentMetricsSchema.optional(),
  }),
});

const supportedContentVersionSchema = z.union([
  z.literal(LEGACY_CONTENT_VERSION),
  z.literal(PREVIOUS_CONTENT_VERSION),
  z.literal(ACT_THREE_CONTENT_VERSION),
  z.literal(CONTENT_VERSION),
]);

export const battleResultSchema = z.object({
  levelId: idSchema,
  seed: z.number().int().min(1).max(2_147_483_647),
  contentVersion: supportedContentVersionSchema,
  modifierIds: z.array(idSchema).max(8),
  result: z.enum(["victory", "defeat"]),
  score: z.number().int().min(0).max(10_000_000),
  completedMasteryIds: z.array(idSchema).max(20),
  completedAt: z.string().datetime(),
  attemptId: opaqueIdSchema.optional(),
  loadoutSnapshot: loadoutSnapshotSchema.optional(),
  defeatedBossEnemyIds: z.array(idSchema).max(20).optional(),
  equipmentMetrics: equipmentMetricsSchema.optional(),
});

export const levelProgressSchema = z.object({
  bestScore: z.number().int().min(0).max(10_000_000),
  victories: z.number().int().min(0).max(9999),
  completedMasteryIds: z.array(idSchema).max(20),
  completedModifierIds: z.array(idSchema).max(20),
});

export const campaignProgressSchema = z.object({
  unlockedNodeIds: z.array(idSchema).min(1).max(200),
  levels: z.record(idSchema, levelProgressSchema),
  recentResults: z.array(battleResultSchema).max(20),
  recordedAttemptIds: z.array(z.string().min(1).max(256)).max(2000).default([]),
});

export const pityCountersSchema = z.object({
  sinceS: z.number().int().min(0).max(4),
  sinceSPlus: z.number().int().min(0).max(11),
  sinceSPlusPlus: z.number().int().min(0).max(29),
  sinceSPlusPlusPlus: z.number().int().min(0).max(59),
});

const receiptBaseSchema = z.object({
  requestId: opaqueIdSchema,
  createdAtSequence: counterSchema,
});

export const economyReceiptSchema = z.discriminatedUnion("kind", [
  receiptBaseSchema.extend({
    kind: z.literal("mission-reward"),
    attemptId: opaqueIdSchema,
    questCrownsGranted: z.number().int().min(0).max(10_000),
    craftingDustGranted: z.number().int().min(0).max(10_000),
    claimIds: z.array(opaqueIdSchema).max(100),
  }),
  receiptBaseSchema.extend({
    kind: z.literal("chest-opened"),
    openSequence: counterSchema,
    chestType: z.enum(["royal-supply", "defender-trunk"]),
    focusDefender: defenderIdSchema.nullable(),
    rolledRarity: equipmentRaritySchema,
    rarity: equipmentRaritySchema,
    itemId: idSchema,
    duplicate: z.boolean(),
    questCrownsSpent: z.number().int().min(0).max(1000),
    craftingDustGranted: z.number().int().min(0).max(10_000),
  }),
  receiptBaseSchema.extend({
    kind: z.literal("crafted"),
    itemId: idSchema,
    craftingDustSpent: z.number().int().min(0).max(10_000),
  }),
  receiptBaseSchema.extend({
    kind: z.literal("salvaged"),
    itemId: idSchema,
    craftingDustGranted: z.number().int().min(0).max(10_000),
  }),
  receiptBaseSchema.extend({
    kind: z.literal("equipped"),
    itemId: idSchema.nullable(),
    defenderId: defenderIdSchema,
    slot: equipmentSlotSchema,
    movedFromDefenderId: defenderIdSchema.nullable(),
  }),
]);

export const economySchema = z.object({
  questCrowns: z.number().int().min(0).max(10_000_000),
  craftingDust: z.number().int().min(0).max(10_000_000),
  rewardClaimIds: z.array(opaqueIdSchema).max(5000),
  replayHistory: z.array(idSchema).max(3),
  replayStreak: z
    .object({ levelId: idSchema, count: z.number().int().min(1).max(9999) })
    .nullable(),
  lootSeed: z
    .string()
    .regex(/^[a-fA-F0-9]{32}$/)
    .nullable(),
  openSequence: counterSchema,
  pity: pityCountersSchema,
  recentReceipts: z.array(economyReceiptSchema).max(100),
});

export const EMPTY_ECONOMY = {
  questCrowns: 0,
  craftingDust: 0,
  rewardClaimIds: [],
  replayHistory: [],
  replayStreak: null,
  lootSeed: null,
  openSequence: 0,
  pity: {
    sinceS: 0,
    sinceSPlus: 0,
    sinceSPlusPlus: 0,
    sinceSPlusPlusPlus: 0,
  },
  recentReceipts: [],
} as const;

export const inventorySchema = z.object({
  ownedItemIds: z.array(idSchema).max(100),
  metadata: z.record(
    idSchema,
    z.object({
      favorite: z.boolean(),
      locked: z.boolean(),
      isNew: z.boolean(),
    }),
  ),
});

export const EMPTY_INVENTORY = {
  ownedItemIds: [],
  metadata: {},
} as const;

export const guidanceSchema = z.object({
  battleTutorialComplete: z.boolean(),
  rpgTourComplete: z.boolean(),
  rpgTourPending: z.boolean(),
  firstChestOpened: z.boolean(),
  firstEquipComplete: z.boolean(),
  replayBattleGuidance: z.boolean(),
  replayRpgGuidance: z.boolean(),
});

export const DEFAULT_GUIDANCE = {
  battleTutorialComplete: false,
  rpgTourComplete: false,
  rpgTourPending: false,
  firstChestOpened: false,
  firstEquipComplete: false,
  replayBattleGuidance: false,
  replayRpgGuidance: false,
} as const;

const saveEnvelopeSchema = z.object({
  campaign: campaignProgressSchema,
  settings: settingsSchema,
  checkpoint: battleCheckpointSchema.nullable(),
});

export const saveDataSchema = saveEnvelopeSchema.extend({
  contentVersion: z.literal(CONTENT_VERSION),
  equipmentRulesVersion: z
    .literal(EQUIPMENT_RULES_VERSION)
    .default(EQUIPMENT_RULES_VERSION),
  economy: economySchema.default(() => ({
    ...EMPTY_ECONOMY,
    rewardClaimIds: [],
    replayHistory: [],
    recentReceipts: [],
  })),
  inventory: inventorySchema.default(() => ({
    ownedItemIds: [],
    metadata: {},
  })),
  loadouts: loadoutSnapshotSchema.default(EMPTY_LOADOUTS),
  guidance: guidanceSchema.default(DEFAULT_GUIDANCE),
});

export const saveDataSchemaV1 = saveEnvelopeSchema.extend({
  contentVersion: z.literal(LEGACY_CONTENT_VERSION),
});
export const saveDataSchemaV2 = saveEnvelopeSchema.extend({
  contentVersion: z.literal(PREVIOUS_CONTENT_VERSION),
});
export const saveDataSchemaV3 = saveEnvelopeSchema.extend({
  contentVersion: z.literal(ACT_THREE_CONTENT_VERSION),
});

export const cloudSaveSchema = z.object({
  slot: idSchema,
  revision: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  data: saveDataSchema,
});

export const putSaveRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
  data: saveDataSchema,
});

export const profileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  isAnonymous: z.boolean(),
  email: z.string().email().nullable(),
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const saveConflictSchema = apiErrorSchema.extend({
  code: z.literal("SAVE_CONFLICT"),
  remote: cloudSaveSchema,
});

export const placeTowerCommandSchema = z.object({
  type: z.literal("place-tower"),
  towerId: idSchema,
  padId: idSchema,
});

export const upgradeTowerCommandSchema = z.object({
  type: z.literal("upgrade-tower"),
  instanceId: idSchema,
});

export const sellTowerCommandSchema = z.object({
  type: z.literal("sell-tower"),
  instanceId: idSchema,
});

export const startWaveCommandSchema = z.object({
  type: z.literal("start-wave"),
});

export const abilityIdSchema = z.enum([
  "royal-forkfall",
  "emergency-tea-break",
]);

export const activateAbilityCommandSchema = z.object({
  type: z.literal("activate-ability"),
  abilityId: abilityIdSchema.optional(),
});

export const gameCommandSchema = z.discriminatedUnion("type", [
  placeTowerCommandSchema,
  upgradeTowerCommandSchema,
  sellTowerCommandSchema,
  startWaveCommandSchema,
  activateAbilityCommandSchema,
]);

export type AbilityId = z.infer<typeof abilityIdSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type BattleCheckpoint = z.infer<typeof battleCheckpointSchema>;
export type BattleResult = z.infer<typeof battleResultSchema>;
export type CloudSave = z.infer<typeof cloudSaveSchema>;
export type DefenderId = z.infer<typeof defenderIdSchema>;
export type DefenderLoadout = z.infer<typeof defenderLoadoutSchema>;
export type EconomyReceipt = z.infer<typeof economyReceiptSchema>;
export type EquipmentContribution = z.infer<typeof equipmentContributionSchema>;
export type EquipmentProcState = z.infer<typeof equipmentProcStateSchema>;
export type EquipmentRarity = z.infer<typeof equipmentRaritySchema>;
export type EquipmentSlot = z.infer<typeof equipmentSlotSchema>;
export type GameCommand = z.infer<typeof gameCommandSchema>;
export type GameSpeed = z.infer<typeof gameSpeedSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
export type LoadoutSnapshot = z.infer<typeof loadoutSnapshotSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PutSaveRequest = z.infer<typeof putSaveRequestSchema>;
export type SaveConflict = z.infer<typeof saveConflictSchema>;
export type SaveData = z.infer<typeof saveDataSchema>;
export type Settings = z.infer<typeof settingsSchema>;
