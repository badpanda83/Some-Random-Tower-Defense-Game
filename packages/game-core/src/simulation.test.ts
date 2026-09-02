import { describe, expect, it } from "vitest";

import {
  castleHassleLevel,
  muddyMoatLevel,
  towerDefinitions,
} from "./content.js";
import { referenceStrategies, runReferenceStrategy } from "./balance.js";
import type { ActOneLevelId } from "./balance.js";
import { createSimulation } from "./simulation.js";
import {
  EMERGENCY_TEA_BREAK_SLOW_TICKS,
  ROYAL_FORKFALL_CHARGE_TICKS,
  TICK_RATE,
} from "./types.js";

function runFirstWave(): ReturnType<typeof createSimulation> {
  const simulation = createSimulation({ seed: 12345 });
  for (const padId of [
    "bramble-seat",
    "puddle-perch",
    "mushroom-box",
    "crooked-stool",
  ]) {
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId,
    });
  }
  simulation.dispatch({ type: "start-wave" });

  while (simulation.state.phase === "active") {
    simulation.step();
  }
  return simulation;
}

describe("game simulation", () => {
  it("is deterministic for identical commands and seeds", () => {
    const left = runFirstWave();
    const right = runFirstWave();

    expect(left.state).toEqual(right.state);
    expect(left.stateHash()).toBe(right.stateHash());
  });

  it("includes behavior-changing reward entitlements in state hashes", () => {
    const baseline = createSimulation({ seed: 7 });
    const rewarded = createSimulation({
      seed: 7,
      unlockedRewardIds: ["fork-table-service"],
    });

    expect(rewarded.stateHash()).not.toBe(baseline.stateHash());
  });

  it("enforces economy and pad occupancy", () => {
    const simulation = createSimulation();
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "bramble-seat",
    });

    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "fork-knight",
        padId: "bramble-seat",
      }),
    ).toThrow("occupied");

    expect(simulation.state.gold).toBe(muddyMoatLevel.startingGold - 57);
    expect(simulation.state.metrics.spentGold).toBe(57);
  });

  it("counts total placements for mastery even after a tower is sold", () => {
    const simulation = createSimulation();
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "bramble-seat",
    });
    simulation.dispatch({ type: "sell-tower", instanceId: "tower-1" });
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "bramble-seat",
    });

    expect(simulation.state.metrics.maxTowersPlaced).toBe(2);
  });

  it("places and upgrades towers during an active wave", () => {
    const simulation = createSimulation({ seed: 2026 });
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "bramble-seat",
    });
    simulation.dispatch({ type: "start-wave" });
    simulation.step(3);
    const tickBeforeManagement = simulation.state.tick;

    simulation.dispatch({
      type: "place-tower",
      towerId: "discount-wizard",
      padId: "puddle-perch",
    });
    simulation.dispatch({
      type: "upgrade-tower",
      instanceId: "tower-1",
    });

    expect(simulation.state.phase).toBe("active");
    expect(simulation.state.tick).toBe(tickBeforeManagement);
    expect(simulation.state.towers).toEqual([
      expect.objectContaining({
        id: "tower-1",
        towerId: "fork-knight",
        level: 2,
      }),
      expect.objectContaining({
        id: "tower-2",
        towerId: "discount-wizard",
        level: 1,
      }),
    ]);
    expect(simulation.state.gold).toBe(66);
    expect(simulation.state.metrics.spentGold).toBe(204);
  });

  it("rejects illegal and unaffordable tower actions during an active wave", () => {
    const simulation = createSimulation({
      seed: 2026,
      modifierIds: ["stingy-king"],
    });
    simulation.dispatch({
      type: "place-tower",
      towerId: "discount-wizard",
      padId: "puddle-perch",
    });
    simulation.dispatch({ type: "start-wave" });

    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "fork-knight",
        padId: "puddle-perch",
      }),
    ).toThrow("occupied");
    expect(() =>
      simulation.dispatch({
        type: "upgrade-tower",
        instanceId: "missing-tower",
      }),
    ).toThrow("Unknown tower instance");

    simulation.dispatch({
      type: "upgrade-tower",
      instanceId: "tower-1",
    });
    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "discount-wizard",
        padId: "bramble-seat",
      }),
    ).toThrow("Not enough gold");
    expect(() =>
      simulation.dispatch({
        type: "upgrade-tower",
        instanceId: "tower-1",
      }),
    ).toThrow("Not enough gold");
    expect(simulation.state.phase).toBe("active");
    expect(simulation.state.gold).toBe(59);
    expect(simulation.state.towers).toHaveLength(1);
    expect(simulation.state.towers[0]?.level).toBe(2);
  });

  it("gives a lone Fork Knight meaningful deterministic first-wave damage", () => {
    const simulation = createSimulation({ seed: 41 });
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "puddle-perch",
    });
    simulation.dispatch({ type: "start-wave" });
    let defeated = 0;
    let attacks = 0;

    while (simulation.state.phase === "active") {
      const result = simulation.step();
      defeated += result.events.filter(
        (event) => event.type === "enemy-defeated",
      ).length;
      attacks += result.events.filter(
        (event) =>
          event.type === "tower-attacked" && event.towerId === "fork-knight",
      ).length;
    }

    expect(defeated).toBeGreaterThanOrEqual(3);
    expect(attacks).toBeGreaterThanOrEqual(12);
    expect(simulation.state.phase).toBe("defeat");
    expect(towerDefinitions["fork-knight"].levels[0]).toMatchObject({
      damage: 24,
      range: 126,
      cooldownTicks: 16,
    });
  });

  it("applies a clear three-second slow without refreshing active control", () => {
    const simulation = createSimulation({ seed: 19 });
    simulation.dispatch({
      type: "place-tower",
      towerId: "bardbarian",
      padId: "bramble-seat",
    });
    simulation.dispatch({ type: "start-wave" });
    let sawAttack = false;
    while (!sawAttack) {
      const result = simulation.step();
      sawAttack = result.events.some(
        (event) => event.type === "tower-attacked",
      );
    }
    const firstSlowUntil = simulation.state.enemies[0]?.slowUntilTick;

    expect(firstSlowUntil).toBe(
      simulation.state.tick + towerDefinitions.bardbarian.slowTicks,
    );
    expect(towerDefinitions.bardbarian.slowTicks / TICK_RATE).toBe(3);

    simulation.step(towerDefinitions.bardbarian.levels[0].cooldownTicks);
    expect(simulation.state.enemies[0]?.slowUntilTick).toBe(firstSlowUntil);
  });

  it("rejects Forkfall until its deterministic active-wave charge is ready", () => {
    const simulation = createSimulation({ seed: 23 });
    simulation.dispatch({ type: "start-wave" });

    expect(() => simulation.dispatch({ type: "activate-ability" })).toThrow(
      "still charging",
    );
    simulation.step(ROYAL_FORKFALL_CHARGE_TICKS - 1);
    expect(simulation.state.abilityChargeTicks).toBe(
      ROYAL_FORKFALL_CHARGE_TICKS - 1,
    );
    simulation.step();
    expect(simulation.state.abilityChargeTicks).toBe(
      ROYAL_FORKFALL_CHARGE_TICKS,
    );
  });

  it("casts Forkfall on the leading target, deals heavy damage, and resets", () => {
    const simulation = createSimulation({
      checkpoint: {
        levelId: "muddy-moat",
        seed: 29,
        modifierIds: [],
        tick: 900,
        nextWave: 2,
        lives: 12,
        gold: 100,
        score: 0,
        spawnedEnemies: 19,
        abilityChargeTicks: ROYAL_FORKFALL_CHARGE_TICKS,
        placements: [],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });
    simulation.step();
    const target = simulation.state.enemies[0];
    expect(target?.enemyId).toBe("basic-goblin");

    const result = simulation.dispatch({ type: "activate-ability" });

    expect(result.events).toContainEqual({
      type: "ability-activated",
      targetInstanceId: target?.id,
      damageDealt: 70,
    });
    expect(result.state.enemies).toHaveLength(0);
    expect(result.state.abilityChargeTicks).toBe(0);
    expect(() => simulation.dispatch({ type: "activate-ability" })).toThrow(
      "still charging",
    );
  });

  it("creates and restores a between-wave checkpoint", () => {
    const original = runFirstWave();
    const checkpoint = original.createCheckpoint();

    expect(checkpoint).not.toBeNull();
    const restored = createSimulation({ checkpoint: checkpoint! });

    expect(restored.state.waveIndex).toBe(original.state.waveIndex);
    expect(restored.state.gold).toBe(original.state.gold);
    expect(restored.state.score).toBe(original.state.score);
    expect(restored.state.tick).toBe(original.state.tick);
    expect(restored.state.towers).toHaveLength(original.state.towers.length);
    expect(restored.stateHash()).toBe(original.stateHash());
  });

  it.each([
    "muddy-moat",
    "mimic-market",
    "troll-tollway",
    "castle-hassle",
    "frozen-assets",
    "department-of-unnecessary-bridges",
    "siege-and-desist",
  ] as const)("starts and restores %s deterministically", (levelId) => {
    const simulation = createSimulation({ levelId, seed: 17 });
    const checkpoint = simulation.createCheckpoint();

    expect(checkpoint?.levelId).toBe(levelId);
    const restored = createSimulation({ checkpoint: checkpoint! });
    expect(restored.stateHash()).toBe(simulation.stateHash());
  });

  it.each([
    "muddy-moat",
    "mimic-market",
    "troll-tollway",
    "castle-hassle",
    "frozen-assets",
    "department-of-unnecessary-bridges",
    "siege-and-desist",
  ] as const)(
    "has a deterministic first-clear reference build for %s",
    (levelId) => {
      const first = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies["blade-and-magic"],
      );
      const repeated = runReferenceStrategy(
        levelId as ActOneLevelId,
        referenceStrategies["blade-and-magic"],
      );

      expect(first.result).toBe("victory");
      expect(first.lives).toBeGreaterThan(0);
      expect(repeated).toEqual(first);
    },
  );

  it("rejects checkpoints that reference unknown content", () => {
    const original = runFirstWave();
    const checkpoint = original.createCheckpoint();
    expect(checkpoint).not.toBeNull();

    expect(() =>
      createSimulation({
        checkpoint: {
          ...checkpoint!,
          placements: checkpoint!.placements.map((placement, index) =>
            index === 0 ? { ...placement, padId: "missing-pad" } : placement,
          ),
        },
      }),
    ).toThrow("Unknown checkpoint pad");

    expect(() =>
      createSimulation({
        checkpoint: {
          ...checkpoint!,
          placements: checkpoint!.placements.map((placement, index) =>
            index === 0 ? { ...placement, towerId: "constructor" } : placement,
          ),
        },
      }),
    ).toThrow("Unknown checkpoint tower");
  });

  it("rejects checkpoints that bypass authored pad restrictions", () => {
    const original = createSimulation({ levelId: "mimic-market", seed: 12 });
    const checkpoint = original.createCheckpoint()!;

    expect(() =>
      createSimulation({
        checkpoint: {
          ...checkpoint,
          gold: checkpoint.gold - towerDefinitions["discount-wizard"].cost,
          placements: [
            {
              id: "tower-1",
              towerId: "discount-wizard",
              padId: "register-desk",
              level: 1,
            },
          ],
          metrics: {
            ...checkpoint.metrics,
            spentGold: towerDefinitions["discount-wizard"].cost,
            usedTowerIds: ["discount-wizard"],
          },
        },
      }),
    ).toThrow(/not allowed on pad/i);

    const frozenCheckpoint = createSimulation({
      levelId: "frozen-assets",
      seed: 12,
    }).createCheckpoint()!;
    expect(() =>
      createSimulation({
        checkpoint: {
          ...frozenCheckpoint,
          placements: [
            {
              id: "tower-1",
              towerId: "fork-knight",
              padId: "vault-gate",
              level: 1,
            },
          ],
          metrics: {
            ...frozenCheckpoint.metrics,
            spentGold: towerDefinitions["fork-knight"].cost,
            usedTowerIds: ["fork-knight"],
          },
        },
      }),
    ).toThrow(/denied on pad/i);
  });

  it("never allows negative lives or gold during a complete unassisted battle", () => {
    const simulation = createSimulation({ seed: 7 });

    while (
      simulation.state.phase !== "victory" &&
      simulation.state.phase !== "defeat"
    ) {
      if (simulation.state.phase === "preparing") {
        simulation.dispatch({ type: "start-wave" });
      } else {
        simulation.step(10);
      }
      expect(simulation.state.lives).toBeGreaterThanOrEqual(0);
      expect(simulation.state.gold).toBeGreaterThanOrEqual(0);
    }

    expect(simulation.state.phase).toBe("defeat");
  });

  it("makes Sale Rush spawn the authored market wave sooner", () => {
    const normal = createSimulation({ levelId: "mimic-market", seed: 4 });
    const rushed = createSimulation({
      levelId: "mimic-market",
      seed: 4,
      modifierIds: ["sale-rush"],
    });
    normal.dispatch({ type: "start-wave" });
    rushed.dispatch({ type: "start-wave" });

    normal.step(100);
    rushed.step(100);

    expect(rushed.state.nextSpawnIndex).toBeGreaterThan(
      normal.state.nextSpawnIndex,
    );
  });

  it("supports a complete victory with a varied tactical build", () => {
    const report = runReferenceStrategy(
      "muddy-moat",
      referenceStrategies["five-tower-party"],
    );

    expect(report.result).toBe("victory");
    expect(report.lives).toBeGreaterThan(0);
    expect(report.completedMasteryIds).toContain("balanced-party");
  });

  it("resolves wave 6 only after the boss phase and all enemies are defeated", () => {
    const simulation = createSimulation({
      checkpoint: {
        levelId: "muddy-moat",
        seed: 123,
        modifierIds: [],
        tick: 4_027,
        nextWave: 5,
        lives: 12,
        gold: 0,
        score: 15_000,
        spawnedEnemies: 67,
        placements: muddyMoatLevel.pads.map((pad, index) => ({
          id: `tower-${index + 1}`,
          towerId:
            index % 3 === 0
              ? "discount-wizard"
              : index % 3 === 1
                ? "fork-knight"
                : "bardbarian",
          padId: pad.id,
          level: 3,
        })),
        metrics: {
          spentGold: 1_500,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["bardbarian", "discount-wizard", "fork-knight"],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let bossId: string | null = null;
    let sawBossPhase = false;
    let sawBossDefeat = false;
    let battleCompleteEvents = 0;

    while (simulation.state.phase === "active") {
      const result = simulation.step();
      for (const event of result.events) {
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "dragon-intern"
        ) {
          bossId = event.instanceId;
        }
        if (event.type === "boss-phase") {
          expect(event.instanceId).toBe(bossId);
          const boss = result.state.enemies.find(
            (enemy) => enemy.id === event.instanceId,
          );
          expect(boss).toMatchObject({ bossPhase: true });
          expect(boss?.health).toBe(Math.floor((boss?.maxHealth ?? 0) / 2));
          sawBossPhase = true;
        }
        if (event.type === "enemy-defeated" && event.instanceId === bossId) {
          expect(sawBossPhase).toBe(true);
          sawBossDefeat = true;
        }
        if (event.type === "battle-complete") {
          expect(event.result).toBe("victory");
          battleCompleteEvents += 1;
        }
      }
    }

    expect(bossId).not.toBeNull();
    expect(sawBossPhase).toBe(true);
    expect(sawBossDefeat).toBe(true);
    expect(simulation.state).toMatchObject({
      phase: "victory",
      waveIndex: muddyMoatLevel.waves.length,
      enemies: [],
    });
    expect(battleCompleteEvents).toBe(1);
  });

  it("enforces the pad-restricted tower list on Mimic Market's register desk", () => {
    const simulation = createSimulation({ levelId: "mimic-market", seed: 5 });

    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "discount-wizard",
        padId: "register-desk",
      }),
    ).toThrow("cannot be placed on pad");

    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "register-desk",
    });
    expect(simulation.state.towers).toHaveLength(1);
  });

  it("blocks placement and attacks on a shut-down pad during its scheduled window", () => {
    const shutdown = { waveIndex: 2, fromTick: 30, toTick: 80 };
    const simulation = createSimulation({
      checkpoint: {
        levelId: "troll-tollway",
        seed: 5,
        modifierIds: [],
        tick: 0,
        nextWave: shutdown.waveIndex,
        lives: 12,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId: "fork-knight",
            padId: "toll-booth-two",
            level: 3,
          },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["fork-knight"],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let attemptedDuringShutdown = false;
    let sawAttackDuringShutdown = false;
    let sawAttackOutsideShutdown = false;

    while (simulation.state.phase === "active") {
      const state = simulation.state;
      const elapsed =
        state.waveStartedAtTick === null
          ? 0
          : state.tick - state.waveStartedAtTick;
      const withinWindow =
        elapsed >= shutdown.fromTick && elapsed < shutdown.toTick;

      if (withinWindow && !attemptedDuringShutdown) {
        attemptedDuringShutdown = true;
        expect(() =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "bardbarian",
            padId: "toll-booth-two",
          }),
        ).toThrow("is shut down");
      }

      const result = simulation.step();
      const postElapsed =
        result.state.waveStartedAtTick === null
          ? 0
          : result.state.tick - result.state.waveStartedAtTick;
      const postWithinWindow =
        postElapsed >= shutdown.fromTick && postElapsed < shutdown.toTick;
      for (const event of result.events) {
        if (
          event.type === "tower-attacked" &&
          event.towerInstanceId === "tower-1"
        ) {
          if (postWithinWindow) {
            sawAttackDuringShutdown = true;
          } else {
            sawAttackOutsideShutdown = true;
          }
        }
      }
    }

    expect(attemptedDuringShutdown).toBe(true);
    expect(sawAttackDuringShutdown).toBe(false);
    expect(sawAttackOutsideShutdown).toBe(true);
  });

  it("lets Coupon Squire absorb exactly one hit with its first-hit ward", () => {
    const simulation = createSimulation({
      checkpoint: {
        levelId: "mimic-market",
        seed: 5,
        modifierIds: [],
        tick: 0,
        nextWave: 2,
        lives: 12,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId: "fork-knight",
            padId: "bargain-bin",
            level: 3,
          },
          {
            id: "tower-2",
            towerId: "fork-knight",
            padId: "register-desk",
            level: 3,
          },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["fork-knight"],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let squireId: string | null = null;
    let sawWardedHit = false;
    let sawUnwardedHit = false;
    let ticks = 0;
    while (simulation.state.phase === "active" && ticks < 6_000) {
      const result = simulation.step();
      ticks += 1;
      for (const event of result.events) {
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "coupon-squire" &&
          !squireId
        ) {
          squireId = event.instanceId;
        }
        if (
          event.type === "tower-attacked" &&
          squireId &&
          event.affectedInstanceIds.includes(squireId)
        ) {
          const squire = result.state.enemies.find((e) => e.id === squireId);
          if (!squire) continue;
          if (!sawWardedHit) {
            expect(squire.wardConsumed).toBe(true);
            expect(squire.health).toBe(squire.maxHealth);
            sawWardedHit = true;
          } else if (!sawUnwardedHit) {
            expect(squire.health).toBeLessThan(squire.maxHealth);
            sawUnwardedHit = true;
          }
        }
      }
      if (sawWardedHit && sawUnwardedHit) break;
    }

    expect(squireId).not.toBeNull();
    expect(sawWardedHit).toBe(true);
    expect(sawUnwardedHit).toBe(true);
  });

  it("keeps Queue Jumper immune to slow effects", () => {
    const simulation = createSimulation({
      checkpoint: {
        levelId: "troll-tollway",
        seed: 5,
        modifierIds: [],
        tick: 0,
        nextWave: 2,
        lives: 12,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId: "bardbarian",
            padId: "toll-booth-one",
            level: 3,
          },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["bardbarian"],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let jumperId: string | null = null;
    let sawJumperHit = false;
    let ticks = 0;
    while (simulation.state.phase === "active" && ticks < 6_000) {
      const result = simulation.step();
      ticks += 1;
      for (const event of result.events) {
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "queue-jumper" &&
          !jumperId
        ) {
          jumperId = event.instanceId;
        }
        if (
          event.type === "tower-attacked" &&
          jumperId &&
          event.affectedInstanceIds.includes(jumperId)
        ) {
          sawJumperHit = true;
          const jumper = result.state.enemies.find((e) => e.id === jumperId);
          expect(jumper?.slowUntilTick).toBe(0);
        }
      }
      if (sawJumperHit) break;
    }

    expect(jumperId).not.toBeNull();
    expect(sawJumperHit).toBe(true);
  });

  it("transitions Baron von Bog at half health, spawns an escort, and speeds up", () => {
    const simulation = createSimulation({
      checkpoint: {
        levelId: "castle-hassle",
        seed: 5,
        modifierIds: [],
        tick: 0,
        nextWave: castleHassleLevel.waves.length - 1,
        lives: 14,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: castleHassleLevel.pads.map((pad, index) => ({
          id: `tower-${index + 1}`,
          towerId:
            index % 3 === 0
              ? "discount-wizard"
              : index % 3 === 1
                ? "fork-knight"
                : "bardbarian",
          padId: pad.id,
          level: 3,
        })),
        metrics: {
          spentGold: 1_500,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["bardbarian", "discount-wizard", "fork-knight"],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let bossId: string | null = null;
    let sawBossPhase = false;
    let escortSpawns = 0;
    let speedAfterPhase: number | null = null;

    while (simulation.state.phase === "active") {
      const result = simulation.step();
      for (const event of result.events) {
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "baron-von-bog"
        ) {
          bossId = event.instanceId;
        }
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "bog-guard" &&
          sawBossPhase
        ) {
          escortSpawns += 1;
        }
        if (event.type === "boss-phase" && event.instanceId === bossId) {
          const boss = result.state.enemies.find(
            (enemy) => enemy.id === event.instanceId,
          );
          expect(boss).toMatchObject({ bossPhase: true });
          expect(boss?.health).toBe(Math.floor((boss?.maxHealth ?? 0) / 2));
          sawBossPhase = true;
        }
      }
      if (sawBossPhase && speedAfterPhase === null) {
        const before = simulation.state.enemies.find((e) => e.id === bossId);
        speedAfterPhase = before?.pathDistanceMilli ?? null;
      }
      if (escortSpawns >= 2) break;
    }

    expect(bossId).not.toBeNull();
    expect(sawBossPhase).toBe(true);
    expect(escortSpawns).toBe(2);
  });

  it("keeps Fork Knight rank IV focused on one target", () => {
    const simulation = createSimulation({
      seed: 7,
      unlockedRewardIds: ["fork-table-service"],
      checkpoint: {
        levelId: "muddy-moat",
        seed: 7,
        modifierIds: [],
        tick: 0,
        nextWave: 0,
        lives: 12,
        gold: 500,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId: "fork-knight",
            padId: "puddle-perch",
            level: 4,
          },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [],
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });

    let maxAffected = 0;
    let ticks = 0;
    while (simulation.state.phase === "active" && ticks < 3_000) {
      const result = simulation.step();
      ticks += 1;
      for (const event of result.events) {
        if (event.type === "tower-attacked") {
          maxAffected = Math.max(maxAffected, event.affectedInstanceIds.length);
        }
      }
    }

    expect(maxAffected).toBe(1);
  });

  it("rejects rank IV Fork Knight placements when Table Service is not unlocked", () => {
    expect(() =>
      createSimulation({
        checkpoint: {
          levelId: "muddy-moat",
          seed: 7,
          modifierIds: [],
          tick: 0,
          nextWave: 0,
          lives: 12,
          gold: 500,
          score: 0,
          spawnedEnemies: 0,
          placements: [
            {
              id: "tower-1",
              towerId: "fork-knight",
              padId: "puddle-perch",
              level: 4,
            },
          ],
          metrics: {
            spentGold: 0,
            leakedEnemies: 0,
            soldTowers: 0,
            usedTowerIds: [],
          },
        },
      }),
    ).toThrow("exceeds the unlocked maximum");
  });

  it("caps Fork Knight at rank III without the Table Service reward", () => {
    const simulation = createSimulation({ seed: 7 });
    simulation.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: "puddle-perch",
    });
    simulation.dispatch({
      type: "upgrade-tower",
      instanceId: "tower-1",
    });
    simulation.dispatch({
      type: "upgrade-tower",
      instanceId: "tower-1",
    });
    expect(simulation.state.towers[0]?.level).toBe(3);
    expect(() =>
      simulation.dispatch({ type: "upgrade-tower", instanceId: "tower-1" }),
    ).toThrow("Tower is already at maximum level");
  });

  it("activates Emergency Tea Break once per wave and persists the flag across checkpoints", () => {
    const simulation = createSimulation({
      unlockedRewardIds: ["emergency-tea-break"],
      checkpoint: {
        levelId: "muddy-moat",
        seed: 7,
        modifierIds: [],
        tick: 0,
        nextWave: 0,
        lives: 12,
        gold: 500,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          "bramble-seat",
          "puddle-perch",
          "mushroom-box",
          "crooked-stool",
        ].map((padId, index) => ({
          id: `tower-${index + 1}`,
          towerId: "fork-knight",
          padId,
          level: 1,
        })),
        metrics: {
          spentGold: 228,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["fork-knight"],
          maxTowersPlaced: 4,
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });
    simulation.step(3);

    const nonBossBefore = simulation.state.enemies.filter(
      (enemy) => enemy.enemyId !== "dragon-intern",
    );
    expect(nonBossBefore.length).toBeGreaterThan(0);

    const result = simulation.dispatch({
      type: "activate-ability",
      abilityId: "emergency-tea-break",
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: "tea-break-activated" }),
    );
    for (const enemy of result.state.enemies) {
      if (enemy.enemyId === "dragon-intern") continue;
      expect(enemy.slowUntilTick).toBe(
        result.state.tick + EMERGENCY_TEA_BREAK_SLOW_TICKS,
      );
    }
    expect(result.state.teaBreakUsedThisWave).toBe(true);

    expect(() =>
      simulation.dispatch({
        type: "activate-ability",
        abilityId: "emergency-tea-break",
      }),
    ).toThrow("already been used this wave");

    const checkpoint = (() => {
      // Force a between-wave checkpoint by draining the wave first.
      while (simulation.state.phase === "active") {
        simulation.step(10);
      }
      return simulation.createCheckpoint();
    })();
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.teaBreakUsedThisWave).toBe(false);

    const restored = createSimulation({
      unlockedRewardIds: ["emergency-tea-break"],
      checkpoint: checkpoint!,
    });
    restored.dispatch({ type: "start-wave" });
    restored.step(3);
    expect(() =>
      restored.dispatch({
        type: "activate-ability",
        abilityId: "emergency-tea-break",
      }),
    ).not.toThrow();
  });

  it("rejects Emergency Tea Break when not unlocked", () => {
    const simulation = createSimulation({ seed: 7 });
    simulation.dispatch({ type: "start-wave" });
    expect(() =>
      simulation.dispatch({
        type: "activate-ability",
        abilityId: "emergency-tea-break",
      }),
    ).toThrow("not been unlocked");
  });

  it("extends an existing shorter slow when Emergency Tea Break is used", () => {
    const simulation = createSimulation({
      unlockedRewardIds: ["emergency-tea-break"],
      checkpoint: {
        levelId: "muddy-moat",
        seed: 7,
        modifierIds: [],
        tick: 0,
        nextWave: 0,
        lives: 12,
        gold: 185,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId: "bardbarian",
            padId: "bramble-seat",
            level: 1,
          },
        ],
        metrics: {
          spentGold: 85,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: ["bardbarian"],
          maxTowersPlaced: 1,
        },
      },
    });
    simulation.dispatch({ type: "start-wave" });
    for (
      let safety = 0;
      safety < 100 &&
      !simulation.state.enemies.some(
        (enemy) => enemy.slowUntilTick > simulation.state.tick,
      );
      safety += 1
    ) {
      simulation.step(1);
    }
    const slowed = simulation.state.enemies.find(
      (enemy) => enemy.slowUntilTick > simulation.state.tick,
    );
    expect(slowed).toBeDefined();
    expect(slowed!.slowUntilTick).toBeLessThan(
      simulation.state.tick + EMERGENCY_TEA_BREAK_SLOW_TICKS,
    );

    simulation.dispatch({
      type: "activate-ability",
      abilityId: "emergency-tea-break",
    });

    expect(
      simulation.state.enemies.find((enemy) => enemy.id === slowed!.id)
        ?.slowUntilTick,
    ).toBe(simulation.state.tick + EMERGENCY_TEA_BREAK_SLOW_TICKS);
  });
});
