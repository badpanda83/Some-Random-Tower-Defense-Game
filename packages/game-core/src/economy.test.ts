import { describe, expect, it } from "vitest";

import {
  CHEST_DEFINITIONS,
  CRAFT_COST,
  DUPLICATE_DUST,
  MVP_EQUIPMENT,
  PITY_THRESHOLDS,
  SALVAGE_DUST,
  battleAttemptKey,
  craftItem,
  equipItem,
  grantMissionRewards,
  openChest,
  pityRemaining,
  salvageItem,
} from "./economy.js";
import { createEmptyLoadouts } from "./equipment.js";
import type { BattleResult, EquipmentRarity, SaveData } from "@srtg/protocol";

function save(): SaveData {
  return {
    contentVersion: 4,
    equipmentRulesVersion: 1,
    campaign: {
      unlockedNodeIds: ["muddy-moat"],
      levels: {},
      recentResults: [],
      recordedAttemptIds: [],
    },
    settings: {
      muted: false,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 1,
      keepPlayingWhileAway: false,
    },
    economy: {
      questCrowns: 10_000,
      craftingDust: 10_000,
      rewardClaimIds: [],
      replayHistory: [],
      replayStreak: null,
      lootSeed: "0123456789abcdef0123456789abcdef",
      openSequence: 0,
      pity: {
        sinceS: 0,
        sinceSPlus: 0,
        sinceSPlusPlus: 0,
        sinceSPlusPlusPlus: 0,
      },
      recentReceipts: [],
    },
    inventory: { ownedItemIds: [], metadata: {} },
    loadouts: createEmptyLoadouts(),
    guidance: {
      battleTutorialComplete: false,
      rpgTourComplete: false,
      rpgTourPending: false,
      firstChestOpened: false,
      firstEquipComplete: false,
      replayBattleGuidance: false,
      replayRpgGuidance: false,
    },
    checkpoint: null,
  };
}

function victory(overrides: Partial<BattleResult> = {}): BattleResult {
  return {
    levelId: "muddy-moat",
    seed: 7,
    contentVersion: 4,
    modifierIds: [],
    result: "victory",
    score: 100,
    completedMasteryIds: [],
    completedAt: "2026-09-02T12:00:00.000Z",
    attemptId: "attempt-7",
    loadoutSnapshot: createEmptyLoadouts(),
    defeatedBossEnemyIds: [],
    equipmentMetrics: {},
    ...overrides,
  };
}

describe("RPG economy", () => {
  it("publishes exact complete odds and exactly 19 MVP items", () => {
    expect(MVP_EQUIPMENT).toHaveLength(19);
    for (const chest of Object.values(CHEST_DEFINITIONS)) {
      expect(
        Object.values(chest.odds).reduce((sum, odds) => sum + odds, 0),
      ).toBe(10_000);
    }
    expect(CHEST_DEFINITIONS["royal-supply"].price).toBe(120);
    expect(CHEST_DEFINITIONS["defender-trunk"].price).toBe(180);
    expect(MVP_EQUIPMENT.every((item) => item.phase === "mvp")).toBe(true);
  });

  it("keeps large deterministic samples within five standard deviations", () => {
    for (const chestType of ["royal-supply", "defender-trunk"] as const) {
      let current = save();
      current.guidance.firstChestOpened = true;
      current.economy.questCrowns = 1_000_000;
      current.inventory = {
        ownedItemIds: MVP_EQUIPMENT.map((item) => item.id),
        metadata: Object.fromEntries(
          MVP_EQUIPMENT.map((item) => [
            item.id,
            { favorite: false, locked: false, isNew: false },
          ]),
        ),
      };
      const counts = Object.fromEntries(
        Object.keys(CHEST_DEFINITIONS[chestType].odds).map((rarity) => [
          rarity,
          0,
        ]),
      ) as Record<EquipmentRarity, number>;
      const sampleSize = 3_000;
      for (let index = 0; index < sampleSize; index += 1) {
        const transaction = openChest(current, {
          requestId: `${chestType}-${index}`,
          chestType,
          focusDefender:
            chestType === "defender-trunk" ? "discount-wizard" : null,
          openSequence: current.economy.openSequence,
        });
        if (transaction.receipt.kind !== "chest-opened") {
          throw new Error("Expected chest receipt");
        }
        counts[transaction.receipt.rolledRarity] += 1;
        current = transaction.save;
      }
      for (const [rarity, basisPoints] of Object.entries(
        CHEST_DEFINITIONS[chestType].odds,
      )) {
        const probability = basisPoints / 10_000;
        const expected = sampleSize * probability;
        const tolerance = Math.max(
          8,
          5 * Math.sqrt(sampleSize * probability * (1 - probability)),
        );
        expect(counts[rarity as keyof typeof counts]).toBeGreaterThanOrEqual(
          expected - tolerance,
        );
        expect(counts[rarity as keyof typeof counts]).toBeLessThanOrEqual(
          expected + tolerance,
        );
      }
    }
  });

  it("grants first-clear, mastery, challenge, and boss rewards exactly once", () => {
    const result = victory({
      levelId: "mimic-market",
      modifierIds: ["toll-free-tuesday"],
      completedMasteryIds: ["mimic-master"],
      defeatedBossEnemyIds: ["grand-till-mimic"],
    });
    const first = grantMissionRewards(save(), result);
    expect(first.receipt).toMatchObject({
      kind: "mission-reward",
      questCrownsGranted: 180,
      craftingDustGranted: 25,
    });
    const retry = grantMissionRewards(first.save, result);
    expect(retry.save).toBe(first.save);
    expect(retry.receipt).toEqual(first.receipt);
  });

  it("does not regrant a recorded mission after its receipt is evicted", () => {
    const result = victory({ attemptId: "attempt-evicted" });
    const first = grantMissionRewards(save(), result);
    const recorded = {
      ...first.save,
      campaign: {
        ...first.save.campaign,
        recordedAttemptIds: ["attempt:attempt-evicted"],
      },
      economy: {
        ...first.save.economy,
        recentReceipts: [],
      },
    };

    const retry = grantMissionRewards(recorded, result);
    expect(retry).toEqual({ save: recorded, receipt: null, lines: [] });
  });

  it("uses the durable campaign key for legacy results without attempt IDs", () => {
    const result = victory({ attemptId: undefined });
    const first = grantMissionRewards(save(), result);
    const recorded = {
      ...first.save,
      campaign: {
        ...first.save.campaign,
        recordedAttemptIds: [battleAttemptKey(result)],
      },
      economy: {
        ...first.save.economy,
        recentReceipts: [],
      },
    };

    expect(grantMissionRewards(recorded, result)).toEqual({
      save: recorded,
      receipt: null,
      lines: [],
    });
  });

  it("deduplicates mastery and challenge IDs before granting rewards", () => {
    const result = grantMissionRewards(
      save(),
      victory({
        levelId: "mimic-market",
        completedMasteryIds: ["mimic-master", "mimic-master"],
        modifierIds: ["toll-free-tuesday", "toll-free-tuesday"],
      }),
    );

    expect(result.receipt).toMatchObject({
      kind: "mission-reward",
      questCrownsGranted: 150,
    });
    expect(result.lines.filter((line) => line.kind === "mastery")).toHaveLength(
      1,
    );
    expect(
      result.lines.filter((line) => line.kind === "challenge"),
    ).toHaveLength(1);
  });

  it("uses varied and diminishing replay rewards without reaching zero", () => {
    const base = save();
    base.campaign.levels["muddy-moat"] = {
      bestScore: 1,
      victories: 1,
      completedMasteryIds: [],
      completedModifierIds: [],
    };
    const varied = grantMissionRewards(base, victory());
    expect(varied.receipt).toMatchObject({ questCrownsGranted: 30 });
    const second = grantMissionRewards(
      varied.save,
      victory({ attemptId: "attempt-8" }),
    );
    expect(second.receipt).toMatchObject({ questCrownsGranted: 10 });
    const third = grantMissionRewards(
      second.save,
      victory({ attemptId: "attempt-9" }),
    );
    expect(third.receipt).toMatchObject({ questCrownsGranted: 5 });
  });

  it("makes the first chest B+ compatible, deterministic, and idempotent", () => {
    const first = openChest(save(), {
      requestId: "first-open",
      chestType: "royal-supply",
      focusDefender: "bardbarian",
      openSequence: 0,
    });

    expect(["B", "A", "S", "S+", "S++", "S+++"]).toContain(
      first.receipt.kind === "chest-opened" ? first.receipt.rarity : "",
    );
    expect(first.save.economy.questCrowns).toBe(9_880);
    expect(first.save.economy.openSequence).toBe(1);
    const replay = openChest(first.save, {
      requestId: "first-open",
      chestType: "royal-supply",
      focusDefender: "bardbarian",
      openSequence: 0,
    });
    expect(replay.save).toBe(first.save);
    expect(replay.receipt).toEqual(first.receipt);

    const aged = {
      ...first.save,
      economy: { ...first.save.economy, recentReceipts: [] },
    };
    expect(() =>
      openChest(aged, {
        requestId: "first-open",
        chestType: "royal-supply",
        focusDefender: "bardbarian",
        openSequence: 0,
      }),
    ).toThrow(/already used/);
  });

  it("keeps replay claims compact and never writes beyond the save schema cap", () => {
    const base = save();
    base.campaign.levels["muddy-moat"] = {
      bestScore: 100,
      victories: 1,
      completedMasteryIds: [],
      completedModifierIds: [],
    };
    base.economy.rewardClaimIds = Array.from(
      { length: 5000 },
      (_, index) => `request:history-${index}`,
    );

    const replay = grantMissionRewards(
      base,
      victory({ attemptId: "attempt-full-history" }),
    );
    expect(replay.save.economy.rewardClaimIds).toHaveLength(5000);
    expect(replay.receipt).toMatchObject({ questCrownsGranted: 30 });
  });

  it("reserves reward history space before accepting economy actions", () => {
    const base = save();
    base.economy.rewardClaimIds = Array.from(
      { length: 4800 },
      (_, index) => `request:history-${index}`,
    );

    expect(() =>
      openChest(base, {
        requestId: "blocked-open",
        chestType: "royal-supply",
        focusDefender: null,
        openSequence: 0,
      }),
    ).toThrow(/economy safety limit/);
    expect(() =>
      equipItem(base, "fork-knight", "weapon", null, "allowed-unequip"),
    ).not.toThrow();
  });

  it("triggers and resets the highest pity guarantee", () => {
    const base = save();
    base.guidance.firstChestOpened = true;
    base.economy.pity = {
      sinceS: PITY_THRESHOLDS.S - 1,
      sinceSPlus: PITY_THRESHOLDS["S+"] - 1,
      sinceSPlusPlus: PITY_THRESHOLDS["S++"] - 1,
      sinceSPlusPlusPlus: PITY_THRESHOLDS["S+++"] - 1,
    };
    const result = openChest(base, {
      requestId: "pity-open",
      chestType: "defender-trunk",
      focusDefender: "fork-knight",
      openSequence: 0,
    });
    expect(result.receipt).toMatchObject({ rarity: "S+++" });
    expect(result.save.economy.pity).toEqual({
      sinceS: 0,
      sinceSPlus: 0,
      sinceSPlusPlus: 0,
      sinceSPlusPlusPlus: 0,
    });
    expect(pityRemaining(result.save)["S+++"]).toBe(60);
  });

  it("converts duplicates and guards craft, equip, and salvage atomically", () => {
    const base = save();
    base.guidance.firstChestOpened = true;
    base.inventory = {
      ownedItemIds: MVP_EQUIPMENT.map((item) => item.id),
      metadata: Object.fromEntries(
        MVP_EQUIPMENT.map((item) => [
          item.id,
          { favorite: false, locked: false, isNew: false },
        ]),
      ),
    };
    const chest = openChest(base, {
      requestId: "duplicate-open",
      chestType: "royal-supply",
      focusDefender: null,
      openSequence: 0,
    });
    if (chest.receipt.kind !== "chest-opened") {
      throw new Error("Expected a chest receipt");
    }
    expect(chest.receipt.duplicate).toBe(true);
    expect(chest.receipt.craftingDustGranted).toBe(
      10 + DUPLICATE_DUST[chest.receipt.rarity],
    );

    const craftingBase = save();
    const crafted = craftItem(
      craftingBase,
      "butter-knife-of-bravery",
      "craft-1",
    );
    expect(crafted.save.economy.craftingDust).toBe(10_000 - CRAFT_COST.C);
    const equipped = equipItem(
      crafted.save,
      "fork-knight",
      "weapon",
      "butter-knife-of-bravery",
      "equip-1",
    );
    expect(equipped.save.loadouts["fork-knight"].weapon).toBe(
      "butter-knife-of-bravery",
    );
    expect(() =>
      salvageItem(equipped.save, "butter-knife-of-bravery", "salvage-blocked"),
    ).toThrow(/Unequip/);
    const unequipped = equipItem(
      equipped.save,
      "fork-knight",
      "weapon",
      null,
      "unequip-1",
    );
    const salvaged = salvageItem(
      unequipped.save,
      "butter-knife-of-bravery",
      "salvage-1",
    );
    expect(salvaged.save.economy.craftingDust).toBe(
      crafted.save.economy.craftingDust + SALVAGE_DUST.C,
    );
  });

  it("moves one universal item safely between defenders", () => {
    const base = save();
    base.inventory = {
      ownedItemIds: ["map-that-says-here-ish"],
      metadata: {
        "map-that-says-here-ish": {
          favorite: false,
          locked: false,
          isNew: false,
        },
      },
    };
    const first = equipItem(
      base,
      "fork-knight",
      "charm",
      "map-that-says-here-ish",
      "equip-map-1",
    );
    const moved = equipItem(
      first.save,
      "bardbarian",
      "charm",
      "map-that-says-here-ish",
      "equip-map-2",
    );
    expect(moved.save.loadouts["fork-knight"].charm).toBeNull();
    expect(moved.save.loadouts.bardbarian.charm).toBe("map-that-says-here-ish");
    expect(moved.receipt).toMatchObject({
      movedFromDefenderId: "fork-knight",
    });
  });
});
