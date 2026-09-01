import { describe, expect, it } from "vitest";

import {
  isLegacySaveData,
  migrateSaveDataV1ToV2,
  parseSaveDataWithMigration,
} from "./migration.js";
import {
  CONTENT_VERSION,
  LEGACY_CONTENT_VERSION,
  battleCheckpointSchema,
  gameCommandSchema,
  saveDataSchema,
  saveDataSchemaV1,
} from "./schemas.js";

function freshCampaign() {
  return {
    unlockedNodeIds: ["muddy-moat"],
    levels: {},
    recentResults: [],
  };
}

describe("protocol schemas", () => {
  it("accepts a valid fresh save", () => {
    const save = saveDataSchema.parse({
      contentVersion: CONTENT_VERSION,
      campaign: freshCampaign(),
      settings: {},
      checkpoint: null,
    });

    expect(save.settings.gameSpeed).toBe(1);
    expect(save.settings.muted).toBe(false);
    expect(save.campaign.recordedAttemptIds).toEqual([]);
  });

  it("rejects unknown commands", () => {
    expect(() => gameCommandSchema.parse({ type: "summon-lawyer" })).toThrow();
  });

  it("accepts the manual battlefield ability command and defaults its id", () => {
    expect(gameCommandSchema.parse({ type: "activate-ability" })).toEqual({
      type: "activate-ability",
    });
    expect(
      gameCommandSchema.parse({
        type: "activate-ability",
        abilityId: "emergency-tea-break",
      }),
    ).toEqual({ type: "activate-ability", abilityId: "emergency-tea-break" });
  });

  it("allows tower placements up to the rank IV cap", () => {
    expect(() =>
      battleCheckpointSchema.parse({
        levelId: "muddy-moat",
        seed: 1,
        modifierIds: [],
        tick: 0,
        nextWave: 0,
        lives: 12,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          { id: "tower-1", towerId: "fork-knight", padId: "pad", level: 4 },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [],
        },
      }),
    ).not.toThrow();
  });

  it("rejects saves from an unknown content version", () => {
    expect(() =>
      saveDataSchema.parse({
        contentVersion: 99,
        campaign: freshCampaign(),
        settings: {},
        checkpoint: null,
      }),
    ).toThrow();
  });

  it("rejects a v1 envelope against the current v2 schema", () => {
    expect(() =>
      saveDataSchema.parse({
        contentVersion: LEGACY_CONTENT_VERSION,
        campaign: freshCampaign(),
        settings: {},
        checkpoint: null,
      }),
    ).toThrow();
  });
});

describe("v1 to v2 migration", () => {
  const v1Save = {
    contentVersion: LEGACY_CONTENT_VERSION,
    campaign: {
      unlockedNodeIds: ["muddy-moat", "mimic-market", "troll-tollway"],
      levels: {
        "muddy-moat": {
          bestScore: 4200,
          victories: 2,
          completedMasteryIds: ["dry-socks"],
          completedModifierIds: ["stingy-king"],
        },
      },
      recentResults: [
        {
          levelId: "muddy-moat",
          seed: 5,
          contentVersion: LEGACY_CONTENT_VERSION,
          modifierIds: ["stingy-king"],
          result: "victory",
          score: 4200,
          completedMasteryIds: ["dry-socks"],
          completedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      recordedAttemptIds: [
        "1:muddy-moat:5:stingy-king:2026-01-01T00:00:00.000Z",
      ],
    },
    settings: {
      muted: true,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 2,
    },
    checkpoint: null,
  };

  it("parses legacy v1 data before migration", () => {
    expect(() => saveDataSchemaV1.parse(v1Save)).not.toThrow();
    expect(isLegacySaveData(v1Save)).toBe(true);
    expect(
      isLegacySaveData({ ...v1Save, contentVersion: CONTENT_VERSION }),
    ).toBe(false);
  });

  it("migrates v1 data to a v2-valid save without dropping progress", () => {
    const migrated = migrateSaveDataV1ToV2(v1Save);

    expect(() => saveDataSchema.parse(migrated)).not.toThrow();
    expect(migrated.contentVersion).toBe(CONTENT_VERSION);
    expect(migrated.campaign.unlockedNodeIds).toEqual([
      "muddy-moat",
      "mimic-market",
      "troll-tollway",
    ]);
    expect(migrated.campaign.levels["muddy-moat"]).toEqual(
      v1Save.campaign.levels["muddy-moat"],
    );
    expect(migrated.campaign.recentResults).toEqual(
      v1Save.campaign.recentResults,
    );
    expect(migrated.settings).toEqual(v1Save.settings);
  });

  it("is idempotent when applied to already-migrated data", () => {
    const once = migrateSaveDataV1ToV2(v1Save);
    const twice = migrateSaveDataV1ToV2(once);

    expect(twice).toEqual(once);
  });

  it("parses already-current data unchanged via the convenience helper", () => {
    const current = saveDataSchema.parse({
      contentVersion: CONTENT_VERSION,
      campaign: freshCampaign(),
      settings: {},
      checkpoint: null,
    });

    expect(parseSaveDataWithMigration(current)).toEqual(current);
  });

  it("throws for data matching neither the v1 nor v2 schema", () => {
    expect(() => migrateSaveDataV1ToV2({ nonsense: true })).toThrow();
  });
});
