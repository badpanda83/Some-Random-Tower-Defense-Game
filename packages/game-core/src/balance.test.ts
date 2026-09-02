import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import {
  referenceStrategies,
  representativeStrategyIdsByLevel,
  runReferenceStrategy,
  runTwoForkStressReference,
  twoForkStressPadIdsByLevel,
} from "./balance.js";
import type { ActOneLevelId } from "./balance.js";

describe("Act I balance references", () => {
  it.each(Object.keys(levelDefinitions))(
    "%s supports distinct deterministic compositions",
    (levelId) => {
      const [firstStrategyId, secondStrategyId] =
        representativeStrategyIdsByLevel[levelId as ActOneLevelId];
      const bladeAndMagic = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies[firstStrategyId],
      );

      const bladeAndSong = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies[secondStrategyId],
      );

      expect(bladeAndMagic.result).toBe("victory");
      expect(bladeAndSong.result).toBe("victory");
      expect(bladeAndMagic.waves).toHaveLength(
        levelDefinitions[levelId as ActOneLevelId].waves.length,
      );
      expect(bladeAndSong.waves).toHaveLength(
        levelDefinitions[levelId as ActOneLevelId].waves.length,
      );
      expect(
        bladeAndMagic.contributionByTowerId["fork-knight"]?.attacks,
      ).toBeGreaterThan(0);
      expect(
        bladeAndMagic.contributionByTowerId["discount-wizard"]?.attacks,
      ).toBeGreaterThan(0);
      expect(
        bladeAndSong.contributionByTowerId["fork-knight"]?.attacks,
      ).toBeGreaterThan(0);
      expect(
        bladeAndSong.contributionByTowerId.bardbarian?.attacks,
      ).toBeGreaterThan(0);
    },
  );

  it.each([
    ["muddy-moat", 12, 15],
    ["mimic-market", 15, 20],
    ["troll-tollway", 15, 20],
    ["castle-hassle", 15, 20],
    ["frozen-assets", 15, 20],
    ["department-of-unnecessary-bridges", 15, 20],
    ["siege-and-desist", 15, 20],
    ["lava-lamp-district", 15, 20],
    ["necromancers-networking-event", 15, 20],
    ["quarterly-dragon-review", 18, 22],
  ] as const)(
    "%s meets its representative first-clear duration without excessive on-screen load",
    (levelId, minimumMinutes, maximumMinutes) => {
      const reports = [...representativeStrategyIdsByLevel[levelId]].map(
        (strategyId) =>
          runReferenceStrategy(levelId, referenceStrategies[strategyId]),
      );
      for (const report of reports) {
        expect(report.representativeMinutes).toBeGreaterThanOrEqual(
          minimumMinutes,
        );
        expect(report.representativeMinutes).toBeLessThanOrEqual(
          maximumMinutes,
        );
        expect(report.activeTicks).toBeGreaterThan(10_000);
        expect(report.peakEnemies).toBeLessThanOrEqual(40);
        expect(
          Math.max(...report.waves.map((wave) => wave.seconds)),
        ).toBeLessThanOrEqual(140);
      }
      const measuredAverage =
        reports.reduce(
          (total, report) => total + report.representativeMinutes,
          0,
        ) / reports.length;
      expect(levelDefinitions[levelId].estimatedMinutes).toBe(
        Math.round(measuredAverage),
      );
    },
  );

  it.each([
    ["frozen-assets", 1, 1_547, 3],
    ["department-of-unnecessary-bridges", 9, 13_544, 4],
    ["siege-and-desist", 5, 6_862, 4],
    ["lava-lamp-district", 5, 8_061, 4],
    ["necromancers-networking-event", 3, 3_820, 4],
    ["quarterly-dragon-review", 1, 1_306, 4],
  ] as const)(
    "rejects the exact no-gear mono-Fork matrix on %s",
    (levelId, endingWave, battleTicks, maximumRank) => {
      const report = runTwoForkStressReference(levelId);
      const expectedPadIds = [...twoForkStressPadIdsByLevel[levelId]];
      const placementPadIds = report.buildActions
        .filter((action) => action.action === "place")
        .map((action) => action.padId);
      const maximumRankByPad = Object.fromEntries(
        expectedPadIds.map((padId) => [
          padId,
          Math.max(
            ...report.buildActions
              .filter((action) => action.padId === padId)
              .map((action) => action.resultingLevel),
          ),
        ]),
      );

      expect(placementPadIds).toEqual(expectedPadIds);
      expect(maximumRankByPad).toEqual(
        Object.fromEntries(expectedPadIds.map((padId) => [padId, maximumRank])),
      );
      expect(report).toMatchObject({
        strategyId: "mono-fork-matrix",
        result: "defeat",
        endingWave,
        battleTicks,
        lives: 0,
        towers: 2,
      });
    },
  );

  it("keeps the prebuilt max-rank Frozen Assets stress fixture losing", () => {
    const report = runReferenceStrategy(
      "frozen-assets",
      referenceStrategies["two-knight-table-service"],
    );

    expect(report).toMatchObject({
      result: "defeat",
      lives: 0,
      towers: 2,
      spentGold: 0,
    });
  });

  it.each([
    "department-of-unnecessary-bridges",
    "siege-and-desist",
    "lava-lamp-district",
    "necromancers-networking-event",
  ] as const)(
    "%s keeps two distinct mixed references healthy and contributing",
    (levelId) => {
      const reports = representativeStrategyIdsByLevel[levelId].map(
        (strategyId) =>
          runReferenceStrategy(levelId, referenceStrategies[strategyId]),
      );
      const towerTypeSets = reports.map((report) =>
        Object.entries(report.contributionByTowerId)
          .filter(
            ([, contribution]) =>
              contribution.attacks >= 10 &&
              contribution.damageDealt >= 500 &&
              contribution.defeatedEnemies >= 5,
          )
          .map(([towerId]) => towerId)
          .sort(),
      );

      expect(reports.map((report) => report.result)).toEqual([
        "victory",
        "victory",
      ]);
      expect(reports.every((report) => report.lives >= 4)).toBe(true);
      expect(reports.every((report) => report.gold >= 100)).toBe(true);
      expect(towerTypeSets.every((towerIds) => towerIds.length >= 2)).toBe(
        true,
      );
      expect(towerTypeSets[0]).not.toEqual(towerTypeSets[1]);
    },
  );

  it("keeps every authored mastery feasible across specialized references", () => {
    const muddyAccounting = runReferenceStrategy(
      "muddy-moat",
      referenceStrategies["royal-accounting"],
    );
    const muddyParty = runReferenceStrategy(
      "muddy-moat",
      referenceStrategies["five-tower-party"],
    );
    const marketCompact = runReferenceStrategy(
      "mimic-market",
      referenceStrategies["five-tower-party"],
    );
    const marketClean = runReferenceStrategy(
      "mimic-market",
      referenceStrategies["blade-and-magic"],
    );
    const tollway = runReferenceStrategy(
      "troll-tollway",
      referenceStrategies["blade-and-magic"],
    );
    const castle = runReferenceStrategy(
      "castle-hassle",
      referenceStrategies["blade-and-song"],
    );

    expect(muddyAccounting.completedMasteryIds).toEqual(
      expect.arrayContaining(["balanced-party", "royal-accounting"]),
    );
    expect(muddyParty.completedMasteryIds).toContain("dry-socks");
    expect(marketCompact.completedMasteryIds).toContain("window-shopper");
    expect(marketClean.completedMasteryIds).toContain("refund-denied");
    expect(tollway.completedMasteryIds).toEqual(
      expect.arrayContaining([
        "exact-change",
        "orderly-queue",
        "no-resale-value",
      ]),
    );
    expect(castle.completedMasteryIds).toEqual(
      expect.arrayContaining([
        "courtyard-custodian",
        "skeleton-crew",
        "before-the-bell",
      ]),
    );

    const frozenBalanced = runReferenceStrategy(
      "frozen-assets",
      referenceStrategies["budget-party"],
    );
    const frozenThinIce = runReferenceStrategy(
      "frozen-assets",
      referenceStrategies["blade-and-magic"],
      ["thin-ice"],
    );
    const bridgesDefault = runReferenceStrategy(
      "department-of-unnecessary-bridges",
      referenceStrategies["bridge-blade-and-magic"],
    );
    const bridgesBudget = runReferenceStrategy(
      "department-of-unnecessary-bridges",
      referenceStrategies["bridge-authorized-roster"],
    );
    const siegeClean = runReferenceStrategy(
      "siege-and-desist",
      referenceStrategies["blade-and-magic"],
    );
    const siegeCompact = runReferenceStrategy(
      "siege-and-desist",
      referenceStrategies["siege-skeleton-crew"],
    );

    expect(frozenBalanced.completedMasteryIds).toEqual(
      expect.arrayContaining(["full-defense-roster", "warranty-void"]),
    );
    expect(frozenThinIce.completedMasteryIds).toEqual(
      expect.arrayContaining(["warranty-void", "skate-on-thin-ice"]),
    );
    expect(bridgesDefault.completedMasteryIds).toEqual(
      expect.arrayContaining(["no-tea-time", "management-review"]),
    );
    expect(bridgesBudget.completedMasteryIds).toContain(
      "authorized-expenditure",
    );
    expect(siegeClean.completedMasteryIds).toContain("no-leaks-at-the-gate");
    expect(siegeCompact.completedMasteryIds).toContain("skeleton-siege");
    expect(siegeClean.splitSpawns).toBe(50);
    expect(siegeClean.completedMasteryIds).toContain("authorized-splits-only");

    const lavaSafe = runReferenceStrategy(
      "lava-lamp-district",
      referenceStrategies["volcanic-detour"],
    );
    const networkingCompact = runReferenceStrategy(
      "necromancers-networking-event",
      referenceStrategies["six-degree-defense"],
    );
    const executiveBudget = runReferenceStrategy(
      "quarterly-dragon-review",
      referenceStrategies["executive-budget"],
    );
    expect(lavaSafe.result).toBe("victory");
    expect(lavaSafe.completedMasteryIds).toEqual(
      expect.arrayContaining(["eruption-proof", "respect-the-rope"]),
    );
    expect(networkingCompact.result).toBe("victory");
    expect(networkingCompact.completedMasteryIds).toEqual(
      expect.arrayContaining(["short-reference", "six-degrees"]),
    );
    expect(executiveBudget.result).toBe("victory");
    expect(executiveBudget.spentGold).toBeLessThanOrEqual(1_650);
    expect(executiveBudget.completedMasteryIds).toEqual(
      expect.arrayContaining(["clean-quarter", "under-budget-review"]),
    );
  });

  it.each(
    Object.values(levelDefinitions).filter(
      (level) => level.availableModifierIds.length > 0,
    ),
  )("$name remains winnable with its challenge modifier", (level) => {
    const report = runReferenceStrategy(
      level.id as ActOneLevelId,
      level.id === "muddy-moat"
        ? referenceStrategies["budget-party"]
        : level.id === "department-of-unnecessary-bridges"
          ? referenceStrategies["bridge-blade-and-magic"]
          : level.id === "necromancers-networking-event"
            ? referenceStrategies["network-blade-and-magic"]
            : referenceStrategies["blade-and-magic"],
      level.availableModifierIds,
    );

    expect(report.result).toBe("victory");
  });
});
