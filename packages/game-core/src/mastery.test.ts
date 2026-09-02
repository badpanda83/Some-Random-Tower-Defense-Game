import { describe, expect, it } from "vitest";

import { evaluateMasteryRule, type MasteryContext } from "./mastery.js";
import type { BattleMetrics } from "./types.js";

function metrics(overrides: Partial<BattleMetrics> = {}): BattleMetrics {
  return {
    spentGold: 0,
    authoredSpentGold: overrides.authoredSpentGold ?? overrides.spentGold ?? 0,
    leakedEnemies: 0,
    leakedByEnemyId: {},
    leakedByWaveIndex: {},
    soldTowers: 0,
    usedTowerIds: [],
    maxTowersPlaced: 0,
    bossDefeatPathPercent: null,
    splitSpawns: 0,
    abilityActivations: {},
    lastEnemyClearedTick: {},
    leaksDuringEnvironmentHazards: 0,
    exposedPadUses: 0,
    referredEnemiesReachedHalfway: 0,
    referredWaveIndices: [],
    bossReinforcementCalls: {},
    defeatedBossEnemyIds: [],
    equipment: {},
    ...overrides,
  };
}

describe("Act III mastery metrics", () => {
  it("evaluates environment and referral rules from cumulative metrics", () => {
    expect(
      evaluateMasteryRule(
        { kind: "no-leaks-during-environment-hazards" },
        context(),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        { kind: "no-exposed-pad-uses" },
        context({ metrics: metrics({ exposedPadUses: 1 }) }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        { kind: "no-referred-enemy-reaches-halfway" },
        context({
          metrics: metrics({ referredEnemiesReachedHalfway: 1 }),
        }),
      ),
    ).toBe(false);
  });
});

function context(overrides: Partial<MasteryContext> = {}): MasteryContext {
  return {
    metrics: metrics(),
    modifierIds: [],
    finalGold: 0,
    totalTowerTypeCount: 3,
    finalTick: 1000,
    ...overrides,
  };
}

describe("evaluateMasteryRule", () => {
  it("evaluates no-leaks", () => {
    expect(evaluateMasteryRule({ kind: "no-leaks" }, context())).toBe(true);
    expect(
      evaluateMasteryRule(
        { kind: "no-leaks" },
        context({ metrics: metrics({ leakedEnemies: 1 }) }),
      ),
    ).toBe(false);
  });

  it("evaluates no-leaks-of a specific enemy", () => {
    const rule = { kind: "no-leaks-of", enemyId: "fast-mimic" } as const;
    expect(evaluateMasteryRule(rule, context())).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({ leakedByEnemyId: { "fast-mimic": 1 } }),
        }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({ leakedByEnemyId: { "basic-goblin": 3 } }),
        }),
      ),
    ).toBe(true);
  });

  it("evaluates max-spent-gold", () => {
    const rule = { kind: "max-spent-gold", maxGold: 620 } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ spentGold: 620 }) }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ spentGold: 621 }) }),
      ),
    ).toBe(false);
  });

  it("evaluates max-towers-placed", () => {
    const rule = { kind: "max-towers-placed", maxTowers: 5 } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ maxTowersPlaced: 5 }) }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ maxTowersPlaced: 6 }) }),
      ),
    ).toBe(false);
  });

  it("evaluates max-tower-types", () => {
    const rule = { kind: "max-tower-types", maxTypes: 2 } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({ usedTowerIds: ["fork-knight", "bardbarian"] }),
        }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({
            usedTowerIds: ["fork-knight", "bardbarian", "discount-wizard"],
          }),
        }),
      ),
    ).toBe(false);
  });

  it("evaluates use-all-tower-types", () => {
    const rule = { kind: "use-all-tower-types" } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({
            usedTowerIds: ["fork-knight", "bardbarian", "discount-wizard"],
          }),
          totalTowerTypeCount: 3,
        }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({ usedTowerIds: ["fork-knight"] }),
          totalTowerTypeCount: 3,
        }),
      ),
    ).toBe(false);
  });

  it("evaluates no-tower-sold", () => {
    const rule = { kind: "no-tower-sold" } as const;
    expect(evaluateMasteryRule(rule, context())).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ soldTowers: 1 }) }),
      ),
    ).toBe(false);
  });

  it("evaluates min-final-gold", () => {
    const rule = { kind: "min-final-gold", minGold: 150 } as const;
    expect(evaluateMasteryRule(rule, context({ finalGold: 150 }))).toBe(true);
    expect(evaluateMasteryRule(rule, context({ finalGold: 149 }))).toBe(false);
  });

  it("evaluates victory-under-modifier", () => {
    const rule = {
      kind: "victory-under-modifier",
      modifierId: "sale-rush",
    } as const;
    expect(
      evaluateMasteryRule(rule, context({ modifierIds: ["sale-rush"] })),
    ).toBe(true);
    expect(evaluateMasteryRule(rule, context({ modifierIds: [] }))).toBe(false);
  });

  it("evaluates boss-defeated-before-path-percent", () => {
    const rule = {
      kind: "boss-defeated-before-path-percent",
      maxPercent: 75,
    } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ bossDefeatPathPercent: 40 }) }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ bossDefeatPathPercent: 90 }) }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ bossDefeatPathPercent: null }) }),
      ),
    ).toBe(false);
  });

  it("evaluates no-leaks-in-wave", () => {
    const rule = { kind: "no-leaks-in-wave", waveIndex: 8 } as const;
    expect(evaluateMasteryRule(rule, context())).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ leakedByWaveIndex: { "7": 2 } }) }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ leakedByWaveIndex: { "8": 1 } }) }),
      ),
    ).toBe(false);
  });

  it("evaluates max-split-spawns", () => {
    const rule = { kind: "max-split-spawns", maxSplits: 40 } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ splitSpawns: 40 }) }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({ metrics: metrics({ splitSpawns: 41 }) }),
      ),
    ).toBe(false);
  });

  it("evaluates no-ability-used", () => {
    const rule = {
      kind: "no-ability-used",
      abilityId: "emergency-tea-break",
    } as const;
    expect(evaluateMasteryRule(rule, context())).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({
            abilityActivations: { "emergency-tea-break": 1 },
          }),
        }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          metrics: metrics({ abilityActivations: { "royal-forkfall": 3 } }),
        }),
      ),
    ).toBe(true);
  });

  it("evaluates enemy-cleared-before-half-battle", () => {
    const rule = {
      kind: "enemy-cleared-before-half-battle",
      enemyId: "middle-manager-mage",
    } as const;
    expect(
      evaluateMasteryRule(
        rule,
        context({
          finalTick: 1000,
          metrics: metrics({
            lastEnemyClearedTick: { "middle-manager-mage": 400 },
          }),
        }),
      ),
    ).toBe(true);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          finalTick: 1000,
          metrics: metrics({
            lastEnemyClearedTick: { "middle-manager-mage": 600 },
          }),
        }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        rule,
        context({
          finalTick: 1000,
          metrics: metrics({
            leakedByEnemyId: { "middle-manager-mage": 1 },
            lastEnemyClearedTick: { "middle-manager-mage": 400 },
          }),
        }),
      ),
    ).toBe(false);
    expect(
      evaluateMasteryRule(
        rule,
        context({ finalTick: 1000, metrics: metrics() }),
      ),
    ).toBe(false);
  });
});
