import {
  ACT_THREE_CONTENT_VERSION,
  CONTENT_VERSION,
  DEFAULT_GUIDANCE,
  EMPTY_ECONOMY,
  EMPTY_INVENTORY,
  EMPTY_LOADOUTS,
  EQUIPMENT_RULES_VERSION,
  LEGACY_CONTENT_VERSION,
  PREVIOUS_CONTENT_VERSION,
  saveDataSchema,
  saveDataSchemaV1,
  saveDataSchemaV2,
  saveDataSchemaV3,
  type SaveData,
} from "./schemas.js";

function migratedAttemptId(checkpoint: {
  readonly levelId: string;
  readonly seed: number;
  readonly modifierIds: readonly string[];
}): string {
  return `migrated:${checkpoint.levelId}:${checkpoint.seed}:${
    [...checkpoint.modifierIds].sort().join(".") || "normal"
  }`;
}

function buildRpgScaffolding() {
  return {
    economy: EMPTY_ECONOMY,
    inventory: EMPTY_INVENTORY,
    loadouts: EMPTY_LOADOUTS,
    guidance: DEFAULT_GUIDANCE,
  };
}

/**
 * Pure, idempotent migration from every released save envelope to v4.
 * Existing campaign progress, settings, results, and checkpoint state are
 * preserved; v4 fields are initialized exactly once.
 */
export function migrateSaveDataToV4(input: unknown): SaveData {
  const current = saveDataSchema.safeParse(input);
  if (current.success) {
    return current.data;
  }

  const v3 = saveDataSchemaV3.safeParse(input);
  const v2 = v3.success ? null : saveDataSchemaV2.safeParse(input);
  const legacy = v3.success
    ? v3.data
    : v2?.success
      ? v2.data
      : saveDataSchemaV1.parse(input);
  const rpgState = buildRpgScaffolding();
  const checkpoint = legacy.checkpoint
    ? {
        ...legacy.checkpoint,
        attemptId:
          legacy.checkpoint.attemptId ?? migratedAttemptId(legacy.checkpoint),
        loadoutSnapshot: legacy.checkpoint.loadoutSnapshot ?? EMPTY_LOADOUTS,
      }
    : null;

  return saveDataSchema.parse({
    ...legacy,
    contentVersion: CONTENT_VERSION,
    equipmentRulesVersion: EQUIPMENT_RULES_VERSION,
    checkpoint,
    ...rpgState,
  });
}

/** @deprecated Current migration always normalizes to v4. */
export const migrateSaveDataToV3 = migrateSaveDataToV4;
/** @deprecated Current migration always normalizes to v4. */
export const migrateSaveDataV1ToV2 = migrateSaveDataToV4;
export const migrateSaveDataV1ToV3 = migrateSaveDataToV4;
export const migrateSaveDataV2ToV3 = migrateSaveDataToV4;
export const migrateSaveDataV1ToV4 = migrateSaveDataToV4;
export const migrateSaveDataV2ToV4 = migrateSaveDataToV4;
export const migrateSaveDataV3ToV4 = migrateSaveDataToV4;

export function isLegacySaveData(input: unknown): boolean {
  return saveDataSchemaV1.safeParse(input).success;
}

export function isPreviousSaveData(input: unknown): boolean {
  return saveDataSchemaV2.safeParse(input).success;
}

export function isActThreeSaveData(input: unknown): boolean {
  return saveDataSchemaV3.safeParse(input).success;
}

export function parseSaveDataWithMigration(input: unknown): SaveData {
  return migrateSaveDataToV4(input);
}

export {
  ACT_THREE_CONTENT_VERSION,
  LEGACY_CONTENT_VERSION,
  PREVIOUS_CONTENT_VERSION,
};
