import { describe, expect, it } from "vitest";

import { createFreshSave, withBattleResult } from "./save.js";

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
});
