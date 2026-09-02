import { describe, expect, it } from "vitest";

import {
  applyEquipmentStats,
  equipmentDefinitions,
  FULL_LOADOUT_OUTPUT_CAP_PERCENT,
  MINIMUM_COOLDOWN_PERCENT,
  RANDOM_CONTROL_MIN_COOLDOWN_TICKS,
  validateLoadoutSnapshot,
} from "./equipment.js";
import { validateRpgFoundationContent } from "./validation.js";
import { validateCheckpointContent } from "./validation.js";

const emptyContext = {
  waveElapsedTicks: 100,
  deployedDefenderIds: new Set([
    "fork-knight",
    "discount-wizard",
    "bardbarian",
  ] as const),
};

describe("equipment definitions", () => {
  it("keeps the ten-mission, full-boss, miniboss, and equipment contracts valid", () => {
    expect(validateRpgFoundationContent()).toEqual([]);
  });

  it("authors exactly 19 MVP and 28 launch definitions within horizontal budgets", () => {
    const definitions = Object.values(equipmentDefinitions);
    expect(definitions).toHaveLength(28);
    expect(definitions.filter((item) => item.phase === "mvp")).toHaveLength(19);
    for (const item of definitions) {
      const maximum =
        item.rarity === "C" || item.rarity === "B"
          ? 3
          : item.rarity === "A" || item.rarity === "S"
            ? 5
            : item.rarity === "S+++"
              ? 8
              : 7;
      expect(item.horizontalBudgetPercent).toBeLessThanOrEqual(maximum);
    }
  });

  it("keeps random control procs at the six-second floor or longer", () => {
    const procs = Object.values(equipmentDefinitions).flatMap((item) =>
      item.effects.filter((effect) => effect.kind === "primary-proc"),
    );
    expect(procs.length).toBeGreaterThan(0);
    for (const proc of procs) {
      expect(proc.cooldownTicks).toBeGreaterThanOrEqual(
        RANDOM_CONTROL_MIN_COOLDOWN_TICKS,
      );
      expect(proc.chanceBasisPoints).toBeGreaterThan(0);
      expect(proc.chanceBasisPoints).toBeLessThanOrEqual(10_000);
    }
  });

  it("gives Fork rank IV one non-proccing 35% secondary and never a third", () => {
    const effects = equipmentDefinitions["fork-of-many-tines"].effects;
    expect(effects).toEqual([
      expect.objectContaining({
        kind: "secondary-target",
        damagePercentRanksOneToThree: 60,
        damagePercentRankFour: 35,
        canProc: false,
      }),
    ]);
  });

  it("applies fixed modifiers deterministically and enforces output/cooldown caps", () => {
    const stats = applyEquipmentStats(
      {
        damage: 100,
        cooldownTicks: 100,
        range: 100,
        splashRadius: 100,
        armorIgnorePercent: 0,
      },
      "fork-knight",
      {
        "fork-knight": {
          weapon: "butter-knife-of-bravery",
          armor: null,
          charm: "sir-plus-ones-rsvp",
        },
        "discount-wizard": { weapon: null, armor: null, charm: null },
        bardbarian: { weapon: null, armor: null, charm: null },
      },
      emptyContext,
    );
    expect(stats.damage).toBe(104);
    expect(stats.cooldownTicks).toBe(94);
    expect(stats.range).toBe(108);
    expect(FULL_LOADOUT_OUTPUT_CAP_PERCENT).toBe(15);
    expect(MINIMUM_COOLDOWN_PERCENT).toBe(70);
  });

  it("rejects class mismatches, wrong slots, and duplicate universal ownership", () => {
    expect(
      validateLoadoutSnapshot({
        "fork-knight": {
          weapon: "wand-of-ooze-and-aahs",
          armor: null,
          charm: "plot-armor-pin",
        },
        "discount-wizard": {
          weapon: null,
          armor: null,
          charm: "plot-armor-pin",
        },
        bardbarian: { weapon: null, armor: null, charm: null },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cannot be used/),
        expect.stringMatching(/equipped twice/),
      ]),
    );
  });

  it("validates checkpoint equipment even without referred-wave history", () => {
    expect(
      validateCheckpointContent({
        levelId: "muddy-moat",
        seed: 1,
        modifierIds: [],
        tick: 0,
        nextWave: 0,
        lives: 12,
        gold: 100,
        score: 0,
        spawnedEnemies: 0,
        placements: [],
        loadoutSnapshot: {
          "fork-knight": {
            weapon: "wand-of-ooze-and-aahs",
            armor: null,
            charm: null,
          },
          "discount-wizard": { weapon: null, armor: null, charm: null },
          bardbarian: { weapon: null, armor: null, charm: null },
        },
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [],
          defeatedBossEnemyIds: ["dragon-intern"],
          equipment: {
            "imaginary-sword": {
              procCount: 0,
              directBonusDamage: 0,
              echoDamage: 0,
              controlTicksApplied: 0,
              controlTicksRejected: 0,
              goldSaved: 0,
              lifeDamagePrevented: 0,
              teamBuffUptimeTicks: 0,
            },
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cannot be used/),
        expect.stringMatching(/Unknown defeated boss/),
        expect.stringMatching(/Unknown checkpoint equipment metric/),
      ]),
    );
  });
});
