import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import { referenceStrategies, runReferenceStrategy } from "./balance.js";
import type { ActOneLevelId } from "./balance.js";

describe("Act I balance references", () => {
  it.each(Object.keys(levelDefinitions))(
    "%s supports distinct deterministic compositions",
    (levelId) => {
      const bladeAndMagic = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies["blade-and-magic"],
      );

      const bladeAndSong = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies["blade-and-song"],
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
  ] as const)(
    "%s meets its representative first-clear duration without excessive on-screen load",
    (levelId, minimumMinutes, maximumMinutes) => {
      const reports = [
        referenceStrategies["blade-and-magic"],
        referenceStrategies["blade-and-song"],
      ].map((strategy) => runReferenceStrategy(levelId, strategy));
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
