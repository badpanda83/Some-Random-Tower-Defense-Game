import {
  CONTENT_VERSION,
  LEGACY_CONTENT_VERSION,
  saveDataSchema,
  saveDataSchemaV1,
  type SaveData,
} from "./schemas.js";

/**
 * Migrates a save payload from the legacy v1 content version to the current
 * v2 version. Idempotent: passing already-current (v2) data returns it
 * unchanged (structurally re-validated), so callers can migrate
 * unconditionally on every load without double-transforming.
 *
 * The v1 and v2 envelope shapes are identical except for the top-level
 * `contentVersion` literal (every v2 addition is optional/backward
 * compatible), so migration never drops or resets valid v1 data: Muddy Moat
 * progress, settings, checkpoints, recent results, and any legacy
 * mimic-market/troll-tollway preview unlocks in `unlockedNodeIds` all pass
 * through untouched.
 *
 * Throws if `input` matches neither the v1 nor the v2 schema.
 */
export function migrateSaveDataV1ToV2(input: unknown): SaveData {
  const current = saveDataSchema.safeParse(input);
  if (current.success) {
    return current.data;
  }

  const legacy = saveDataSchemaV1.parse(input);
  return saveDataSchema.parse({
    ...legacy,
    contentVersion: CONTENT_VERSION,
  });
}

/** True when `input` parses as a legacy v1 save envelope. */
export function isLegacySaveData(input: unknown): boolean {
  return saveDataSchemaV1.safeParse(input).success;
}

/**
 * Parses any supported save payload (legacy v1 or current v2), migrating
 * legacy data to the current version. Prefer this at ingestion boundaries
 * (cloud sync, local storage load) so writes can always be normalized back
 * out as v2.
 */
export function parseSaveDataWithMigration(input: unknown): SaveData {
  return migrateSaveDataV1ToV2(input);
}

export { LEGACY_CONTENT_VERSION };
