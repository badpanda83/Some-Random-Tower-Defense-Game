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

const FIRST_CLEAR_CROWNS: Readonly<Record<string, number>> = {
  "muddy-moat": 120,
  "mimic-market": 90,
  "troll-tollway": 90,
  "castle-hassle": 120,
  "frozen-assets": 90,
  "department-of-unnecessary-bridges": 90,
  "siege-and-desist": 120,
  "lava-lamp-district": 90,
  "necromancers-networking-event": 90,
  "quarterly-dragon-review": 150,
};

const BOSS_BOUNTY_LEVELS = new Set([
  "mimic-market",
  "castle-hassle",
  "department-of-unnecessary-bridges",
  "siege-and-desist",
  "lava-lamp-district",
  "quarterly-dragon-review",
]);

function buildRpgScaffoldingFromCampaign(campaign: SaveData["campaign"]) {
  const claimIds = ["veteran:welcome"];
  let questCrowns = 120;
  let craftingDust = 0;
  const earned = new Map<
    string,
    { victorious: boolean; masteries: Set<string>; modifiers: Set<string> }
  >();
  for (const [levelId, progress] of Object.entries(campaign.levels)) {
    earned.set(levelId, {
      victorious: progress.victories > 0,
      masteries: new Set(progress.completedMasteryIds),
      modifiers: new Set(progress.completedModifierIds),
    });
  }
  for (const result of campaign.recentResults) {
    if (result.result !== "victory") {
      continue;
    }
    const progress = earned.get(result.levelId) ?? {
      victorious: false,
      masteries: new Set<string>(),
      modifiers: new Set<string>(),
    };
    progress.victorious = true;
    result.completedMasteryIds.forEach((id) => progress.masteries.add(id));
    result.modifierIds.forEach((id) => progress.modifiers.add(id));
    earned.set(result.levelId, progress);
  }
  for (const [levelId, progress] of earned) {
    if (!progress.victorious) {
      continue;
    }
    const firstClear = FIRST_CLEAR_CROWNS[levelId];
    if (firstClear !== undefined) {
      questCrowns += firstClear;
      claimIds.push(`first:${levelId}`);
    }
    for (const masteryId of progress.masteries) {
      questCrowns += 20;
      claimIds.push(`mastery:${levelId}:${masteryId}`);
    }
    for (const modifierId of progress.modifiers) {
      questCrowns += 40;
      claimIds.push(`challenge:${levelId}:${modifierId}`);
    }
    if (BOSS_BOUNTY_LEVELS.has(levelId)) {
      questCrowns += 30;
      craftingDust += 25;
      claimIds.push(`boss:${levelId}`);
    }
  }
  const welcomeReceipt = {
    kind: "mission-reward" as const,
    requestId: "migration:veteran-welcome",
    createdAtSequence: 1,
    attemptId: "migration:veteran-welcome",
    questCrownsGranted: questCrowns,
    craftingDustGranted: craftingDust,
    claimIds,
  };
  return {
    economy: {
      ...EMPTY_ECONOMY,
      questCrowns,
      craftingDust,
      rewardClaimIds: claimIds,
      replayHistory: [],
      recentReceipts: [welcomeReceipt],
    },
    inventory: { ...EMPTY_INVENTORY, ownedItemIds: [], metadata: {} },
    loadouts: structuredClone(EMPTY_LOADOUTS),
    guidance: {
      ...DEFAULT_GUIDANCE,
      battleTutorialComplete: true,
      rpgTourPending: true,
    },
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
  const rpgState = buildRpgScaffoldingFromCampaign(legacy.campaign);
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
