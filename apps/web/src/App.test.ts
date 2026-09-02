import type {
  BattleCheckpoint,
  LoadoutSnapshot,
  SaveData,
} from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { createFreshSave } from "./save.js";
import { createRetryBattleSetup, prepareBattleRetry } from "./battle-setup.js";

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

  it("persists checkpoint removal before exposing the retry setup", async () => {
    const save = createFreshSave();
    const checkpoint: BattleCheckpoint = {
      levelId: "muddy-moat",
      seed: 101,
      modifierIds: [],
      tick: 400,
      nextWave: 2,
      lives: 10,
      gold: 100,
      score: 500,
      spawnedEnemies: 30,
      placements: [],
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    };
    let persisted: SaveData = { ...save, checkpoint };
    let releasePersist: () => void = () => {};
    const persistGate = new Promise<void>((resolve) => {
      releasePersist = () => resolve();
    });
    const retryPromise = prepareBattleRetry(
      {
        levelId: "muddy-moat",
        seed: 101,
        modifierIds: [],
        unlockedRewardIds: [],
        checkpoint,
        attemptId: "attempt-original",
        loadoutSnapshot: save.loadouts,
        key: 1,
      },
      persisted,
      async (next) => {
        persisted = next;
        await persistGate;
      },
      202,
      "attempt-retry",
      2,
    );

    await Promise.resolve();
    expect(persisted.checkpoint).toBeNull();
    releasePersist();
    await expect(retryPromise).resolves.toMatchObject({
      seed: 202,
      attemptId: "attempt-retry",
      checkpoint: null,
    });
  });
});
