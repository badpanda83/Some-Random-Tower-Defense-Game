import { z } from "zod";

export const CONTENT_VERSION = 1 as const;
export const DEFAULT_SAVE_SLOT = "campaign" as const;

const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const gameSpeedSchema = z.union([z.literal(1), z.literal(2)]);

export const settingsSchema = z.object({
  muted: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  lowEffects: z.boolean().default(false),
  gameSpeed: gameSpeedSchema.default(1),
});

export const towerPlacementSchema = z.object({
  id: idSchema,
  towerId: idSchema,
  padId: idSchema,
  level: z.number().int().min(1).max(3),
});

export const battleCheckpointSchema = z.object({
  levelId: idSchema,
  seed: z.number().int().min(1).max(2_147_483_647),
  modifierIds: z.array(idSchema).max(8),
  tick: z.number().int().min(0).max(100_000_000),
  nextWave: z.number().int().min(0).max(100),
  lives: z.number().int().min(1).max(999),
  gold: z.number().int().min(0).max(999_999),
  score: z.number().int().min(0).max(10_000_000),
  spawnedEnemies: z.number().int().min(0).max(100_000),
  abilityChargeTicks: z.number().int().min(0).max(10_000).optional(),
  placements: z.array(towerPlacementSchema).max(40),
  metrics: z.object({
    spentGold: z.number().int().min(0).max(999_999),
    leakedEnemies: z.number().int().min(0).max(9999),
    soldTowers: z.number().int().min(0).max(9999),
    usedTowerIds: z.array(idSchema).max(40),
  }),
});

export const battleResultSchema = z.object({
  levelId: idSchema,
  seed: z.number().int().min(1).max(2_147_483_647),
  contentVersion: z.literal(CONTENT_VERSION),
  modifierIds: z.array(idSchema).max(8),
  result: z.enum(["victory", "defeat"]),
  score: z.number().int().min(0).max(10_000_000),
  completedMasteryIds: z.array(idSchema).max(20),
  completedAt: z.string().datetime(),
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

export const saveDataSchema = z.object({
  contentVersion: z.literal(CONTENT_VERSION),
  campaign: campaignProgressSchema,
  settings: settingsSchema,
  checkpoint: battleCheckpointSchema.nullable(),
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

export const activateAbilityCommandSchema = z.object({
  type: z.literal("activate-ability"),
});

export const gameCommandSchema = z.discriminatedUnion("type", [
  placeTowerCommandSchema,
  upgradeTowerCommandSchema,
  sellTowerCommandSchema,
  startWaveCommandSchema,
  activateAbilityCommandSchema,
]);

export type ApiError = z.infer<typeof apiErrorSchema>;
export type BattleCheckpoint = z.infer<typeof battleCheckpointSchema>;
export type BattleResult = z.infer<typeof battleResultSchema>;
export type CloudSave = z.infer<typeof cloudSaveSchema>;
export type GameCommand = z.infer<typeof gameCommandSchema>;
export type GameSpeed = z.infer<typeof gameSpeedSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PutSaveRequest = z.infer<typeof putSaveRequestSchema>;
export type SaveConflict = z.infer<typeof saveConflictSchema>;
export type SaveData = z.infer<typeof saveDataSchema>;
export type Settings = z.infer<typeof settingsSchema>;
