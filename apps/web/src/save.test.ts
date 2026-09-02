import { describe, expect, it } from "vitest";

import {
  createFreshSave,
  normalizeSaveProgress,
  unlockedRewardIds,
  withBattleResult,
  withoutBattleCheckpoint,
} from "./save.js";

describe("campaign progress", () => {
  it("unlocks branches without recording the same attempt twice", () => {
    const result = {
      levelId: "muddy-moat",
      seed: 5,
      contentVersion: 1 as const,
      modifierIds: ["stingy-king"],
      result: "victory" as const,
      score: 4000,
      completedMasteryIds: ["dry-socks"],
      completedAt: "2026-08-31T12:00:00.000Z",
    };
    const once = withBattleResult(createFreshSave(), result);
    const twice = withBattleResult(once, result);

    expect(twice.campaign.unlockedNodeIds).toEqual([
      "muddy-moat",
      "mimic-market",
      "troll-tollway",
    ]);
    expect(twice.campaign.levels["muddy-moat"]?.completedMasteryIds).toEqual([
      "dry-socks",
    ]);
    expect(twice.campaign.levels["muddy-moat"]?.victories).toBe(1);
    expect(twice.campaign.recentResults).toHaveLength(1);
  });

  it("records distinct battles when a random seed repeats", () => {
    const first = {
      levelId: "muddy-moat",
      seed: 5,
      contentVersion: 1 as const,
      modifierIds: [],
      result: "victory" as const,
      score: 4000,
      completedMasteryIds: [],
      completedAt: "2026-08-31T12:00:00.000Z",
    };
    const twice = withBattleResult(withBattleResult(createFreshSave(), first), {
      ...first,
      completedAt: "2026-09-01T12:00:00.000Z",
    });

    expect(twice.campaign.levels["muddy-moat"]?.victories).toBe(2);
    expect(twice.campaign.recordedAttemptIds).toHaveLength(2);
  });

  it("keeps attempt idempotency after results leave the recent display list", () => {
    const firstResult = {
      levelId: "muddy-moat",
      seed: 1,
      contentVersion: 1 as const,
      modifierIds: [],
      result: "victory" as const,
      score: 1000,
      completedMasteryIds: [],
      completedAt: "2026-08-31T12:00:00.000Z",
    };
    let save = withBattleResult(createFreshSave(), firstResult);
    for (let seed = 2; seed <= 22; seed += 1) {
      save = withBattleResult(save, {
        ...firstResult,
        seed,
        completedAt: `2026-08-31T12:00:${String(seed).padStart(2, "0")}.000Z`,
      });
    }

    const repeated = withBattleResult(save, firstResult);

    expect(repeated.campaign.recentResults).toHaveLength(20);
    expect(repeated.campaign.levels["muddy-moat"]?.victories).toBe(22);
    expect(repeated.campaign.recordedAttemptIds).toHaveLength(22);
  });

  it("fails visibly instead of growing attempt history past the save limit", () => {
    const save = createFreshSave();
    save.campaign.recordedAttemptIds = Array.from(
      { length: 2000 },
      (_, index) => `1:muddy-moat:${index + 1}:`,
    );

    expect(() =>
      withBattleResult(save, {
        levelId: "muddy-moat",
        seed: 4000,
        contentVersion: 1,
        modifierIds: [],
        result: "victory",
        score: 1000,
        completedMasteryIds: [],
        completedAt: "2026-08-31T12:00:00.000Z",
      }),
    ).toThrow(/result history is full/i);
  });

  it("repairs a missing derived unlock in an older victory save", () => {
    const olderSave = createFreshSave();
    olderSave.campaign.levels["muddy-moat"] = {
      bestScore: 3000,
      victories: 1,
      completedMasteryIds: [],
      completedModifierIds: [],
    };

    expect(normalizeSaveProgress(olderSave).campaign.unlockedNodeIds).toEqual([
      "muddy-moat",
      "mimic-market",
    ]);
  });

  it("unlocks Act I and its power rewards through victories without grind", () => {
    let save = createFreshSave();
    const victory = (levelId: string, minute: number) => {
      save = withBattleResult(save, {
        levelId,
        seed: minute,
        contentVersion: 2,
        modifierIds: [],
        result: "victory",
        score: 3000,
        completedMasteryIds: [],
        completedAt: `2026-08-31T12:${String(minute).padStart(2, "0")}:00.000Z`,
      });
    };

    victory("muddy-moat", 1);
    expect(save.campaign.unlockedNodeIds).toEqual([
      "muddy-moat",
      "mimic-market",
    ]);
    victory("mimic-market", 2);
    expect(save.campaign.unlockedNodeIds).toContain("troll-tollway");
    expect(unlockedRewardIds(save)).toContain("fork-table-service");
    victory("troll-tollway", 3);
    expect(save.campaign.unlockedNodeIds).toContain("castle-hassle");
    victory("castle-hassle", 4);
    expect(unlockedRewardIds(save)).toEqual(
      expect.arrayContaining(["fork-table-service", "emergency-tea-break"]),
    );
  });

  it("materializes progress and rewards from a recovered recent victory", () => {
    const save = createFreshSave();
    save.campaign.recentResults = [
      {
        levelId: "mimic-market",
        seed: 8,
        contentVersion: 2,
        modifierIds: ["rain-check"],
        result: "victory",
        score: 2800,
        completedMasteryIds: ["no-refunds"],
        completedAt: "2026-08-31T12:08:00.000Z",
      },
    ];

    const recovered = normalizeSaveProgress(save);
    expect(recovered.campaign.levels["mimic-market"]).toEqual({
      bestScore: 2800,
      victories: 1,
      completedMasteryIds: ["no-refunds"],
      completedModifierIds: ["rain-check"],
    });
    expect(unlockedRewardIds(recovered)).toContain("fork-table-service");

    const afterDisplayHistoryExpires = normalizeSaveProgress({
      ...recovered,
      campaign: { ...recovered.campaign, recentResults: [] },
    });
    expect(afterDisplayHistoryExpires.campaign.levels["mimic-market"]).toEqual(
      recovered.campaign.levels["mimic-market"],
    );
    expect(unlockedRewardIds(afterDisplayHistoryExpires)).toContain(
      "fork-table-service",
    );
  });

  it("does not unlock branches or mastery after a defeat", () => {
    const defeated = withBattleResult(createFreshSave(), {
      levelId: "muddy-moat",
      seed: 9,
      contentVersion: 1,
      modifierIds: ["stingy-king"],
      result: "defeat",
      score: 800,
      completedMasteryIds: ["dry-socks"],
      completedAt: "2026-08-31T12:00:00.000Z",
    });

    expect(defeated.campaign.unlockedNodeIds).toEqual(["muddy-moat"]);
    expect(defeated.campaign.levels["muddy-moat"]).toMatchObject({
      victories: 0,
      completedMasteryIds: [],
      completedModifierIds: [],
    });
  });

  it("abandons only the in-attempt checkpoint without awarding progress", () => {
    const prior = withBattleResult(createFreshSave(), {
      levelId: "muddy-moat",
      seed: 3,
      contentVersion: 1,
      modifierIds: [],
      result: "victory",
      score: 2500,
      completedMasteryIds: ["dry-socks"],
      completedAt: "2026-08-31T12:00:00.000Z",
    });
    const inProgress = {
      ...prior,
      checkpoint: {
        levelId: "muddy-moat",
        seed: 99,
        modifierIds: ["stingy-king"],
        tick: 120,
        nextWave: 3,
        lives: 7,
        gold: 80,
        score: 900,
        spawnedEnemies: 20,
        placements: [],
        metrics: {
          spentGold: 190,
          leakedEnemies: 3,
          soldTowers: 1,
          usedTowerIds: ["fork-knight"],
        },
      },
    };

    const abandoned = withoutBattleCheckpoint(inProgress);

    expect(abandoned.checkpoint).toBeNull();
    expect(abandoned.campaign).toEqual(prior.campaign);
    expect(abandoned.settings).toEqual(prior.settings);
    expect(abandoned.contentVersion).toBe(prior.contentVersion);
  });

  it("unlocks Act III sequentially, never on defeat, and persists the finale", () => {
    const save = createFreshSave();
    for (const levelId of [
      "muddy-moat",
      "mimic-market",
      "troll-tollway",
      "castle-hassle",
      "frozen-assets",
      "department-of-unnecessary-bridges",
      "siege-and-desist",
      "lava-lamp-district",
      "necromancers-networking-event",
    ]) {
      save.campaign.levels[levelId] = {
        bestScore: 1,
        victories: 1,
        completedMasteryIds: [],
        completedModifierIds: [],
      };
    }
    const ready = normalizeSaveProgress(save);
    expect(ready.campaign.unlockedNodeIds).toContain("quarterly-dragon-review");

    const defeated = withBattleResult(ready, {
      levelId: "quarterly-dragon-review",
      seed: 90,
      contentVersion: 3,
      modifierIds: ["executive-mandate"],
      result: "defeat",
      score: 900,
      completedMasteryIds: ["clean-quarter"],
      completedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(defeated.campaign.levels["quarterly-dragon-review"]).toMatchObject({
      victories: 0,
      completedMasteryIds: [],
      completedModifierIds: [],
    });
    expect(unlockedRewardIds(defeated)).not.toContain("campaign-epilogue");

    const victorious = withBattleResult(defeated, {
      levelId: "quarterly-dragon-review",
      seed: 91,
      contentVersion: 3,
      modifierIds: ["executive-mandate"],
      result: "victory",
      score: 12_000,
      completedMasteryIds: ["clean-quarter", "executive-mandate"],
      completedAt: "2026-09-02T12:20:00.000Z",
    });
    expect(victorious.campaign.levels["quarterly-dragon-review"]).toMatchObject(
      {
        victories: 1,
        bestScore: 12_000,
        completedModifierIds: ["executive-mandate"],
      },
    );
    expect(unlockedRewardIds(victorious)).toEqual(
      expect.arrayContaining([
        "campaign-epilogue",
        "completion-crest",
        "executive-palette",
      ]),
    );
  });
});
