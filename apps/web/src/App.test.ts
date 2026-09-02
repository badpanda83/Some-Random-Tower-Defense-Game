import type { LoadoutSnapshot } from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { createRetryBattleSetup } from "./battle-setup.js";

describe("battle retry setup", () => {
  it("uses a fresh seed and attempt while preserving the battle loadout snapshot", () => {
    const loadoutSnapshot: LoadoutSnapshot = {
      "fork-knight": {
        weapon: "excalifork",
        armor: null,
        charm: null,
      },
      "discount-wizard": {
        weapon: null,
        armor: "robes-of-the-second-draft",
        charm: null,
      },
      bardbarian: {
        weapon: null,
        armor: null,
        charm: "the-forbidden-power-chord",
      },
    };
    const retry = createRetryBattleSetup(
      {
        levelId: "mimic-market",
        seed: 101,
        modifierIds: ["sale-rush"],
        unlockedRewardIds: ["fork-table-service"],
        checkpoint: null,
        attemptId: "attempt-original",
        loadoutSnapshot,
        key: 1,
      },
      202,
      "attempt-retry",
      2,
    );

    expect(retry).toMatchObject({
      levelId: "mimic-market",
      seed: 202,
      modifierIds: ["sale-rush"],
      unlockedRewardIds: ["fork-table-service"],
      checkpoint: null,
      attemptId: "attempt-retry",
      loadoutSnapshot,
      key: 2,
    });
    expect(retry.seed).not.toBe(101);
    expect(retry.attemptId).not.toBe("attempt-original");
    expect(retry.loadoutSnapshot).toBe(loadoutSnapshot);
  });
});
