import { describe, expect, it } from "vitest";

import {
  createFreshSave,
  withBattleResult,
  withoutBattleCheckpoint,
} from "./save.js";

describe("campaign progress", () => {
  it("unlocks branches without duplicating mastery", () => {
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
    expect(twice.campaign.levels["muddy-moat"]?.victories).toBe(2);
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
});
