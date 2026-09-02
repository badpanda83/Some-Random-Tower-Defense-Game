import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import {
  equipmentBalanceScenarios,
  referenceStrategies,
  representativeStrategyIdsByLevel,
  runEquipmentBalanceMatrix,
  runMonoForkStress,
  runReferenceStrategy,
} from "./balance.js";
import { createEmptyLoadouts } from "./equipment.js";
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

  it("rejects the two-max-rank-Knight Frozen Assets build", () => {
    const report = runReferenceStrategy(
      "frozen-assets",
      referenceStrategies["two-knight-table-service"],
    );

    expect(
      referenceStrategies["two-knight-table-service"].initialPlacements,
    ).toEqual([
      { towerId: "fork-knight", padId: "frost-perch", level: 4 },
      { towerId: "fork-knight", padId: "floe-crossing", level: 4 },
    ]);
    expect(report.towers).toBe(2);
    expect(report.result === "defeat" || report.lives <= 3).toBe(true);
    for (const strategyId of representativeStrategyIdsByLevel[
      "frozen-assets"
    ]) {
      const mixed = runReferenceStrategy(
        "frozen-assets",
        referenceStrategies[strategyId],
      );
      expect(mixed.result).toBe("victory");
      expect(
        Object.values(mixed.contributionByTowerId).filter(
          (contribution) => contribution.attacks > 0,
        ).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every approved equipment scenario viable without exceeding output or proc budgets", () => {
    const reports = runEquipmentBalanceMatrix();
    expect(reports).toHaveLength(
      Object.keys(levelDefinitions).length *
        Object.keys(equipmentBalanceScenarios).length *
        2,
    );
    const gearless = new Map(
      reports
        .filter((report) => report.equipmentScenarioId === "no-gear")
        .map((report) => [`${report.levelId}:${report.strategyId}`, report]),
    );
    for (const report of reports) {
      expect(report.result).toBe("victory");
      const baseline = gearless.get(`${report.levelId}:${report.strategyId}`)!;
      expect(baseline.activeTicks / report.activeTicks).toBeLessThanOrEqual(
        1.15,
      );
      const teamDamage = Object.values(report.contributionByTowerId).reduce(
        (total, contribution) => total + contribution.damageDealt,
        0,
      );
      const procDamage = Object.values(report.equipmentContribution).reduce(
        (total, contribution) =>
          total + contribution.directBonusDamage + contribution.echoDamage,
        0,
      );
      expect(procDamage / Math.max(1, teamDamage)).toBeLessThanOrEqual(0.05);
      expect(report.authoredSpentGold).toBeGreaterThanOrEqual(report.spentGold);
    }
  }, 60_000);

  it("keeps Many Tines rank IV below the Frozen Assets anti-degenerate gate", () => {
    const loadouts = createEmptyLoadouts();
    loadouts["fork-knight"].weapon = "fork-of-many-tines";
    const report = runMonoForkStress("frozen-assets", loadouts);
    expect(report.result).toBe("defeat");
    expect(report.waves.length).toBeLessThanOrEqual(6);
    expect(
      report.equipmentContribution["fork-of-many-tines"]?.echoDamage,
    ).toBeGreaterThan(0);
  });

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
      referenceStrategies["blade-and-magic"],
    );
    const bridgesBudget = runReferenceStrategy(
      "department-of-unnecessary-bridges",
      referenceStrategies["royal-accounting"],
    );
    const siegeClean = runReferenceStrategy(
      "siege-and-desist",
      referenceStrategies["blade-and-magic"],
    );
    const siegeCompact = runReferenceStrategy(
      "siege-and-desist",
      referenceStrategies["royal-accounting"],
    );
    const controlledClaims = runReferenceStrategy(
      "siege-and-desist",
      referenceStrategies["claims-control"],
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
    expect(controlledClaims.result).toBe("victory");
    expect(controlledClaims.splitSpawns).toBe(50);
    expect(controlledClaims.completedMasteryIds).toContain(
      "authorized-splits-only",
    );
    expect(siegeClean.splitSpawns).toBe(52);
    expect(siegeClean.completedMasteryIds).not.toContain(
      "authorized-splits-only",
    );

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
        : referenceStrategies["blade-and-magic"],
      level.availableModifierIds,
    );

    expect(report.result).toBe("victory");
  });
});
