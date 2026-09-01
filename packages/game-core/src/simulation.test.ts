import { describe, expect, it } from "vitest";

import { muddyMoatLevel, towerDefinitions } from "./content.js";
import { createSimulation } from "./simulation.js";
import { ROYAL_FORKFALL_CHARGE_TICKS, TICK_RATE } from "./types.js";

function runFirstWave(): ReturnType<typeof createSimulation> {
  const simulation = createSimulation({ seed: 12345 });
  simulation.dispatch({
    type: "place-tower",
    towerId: "fork-knight",
    padId: "bramble-seat",
  });
  simulation.dispatch({
    type: "place-tower",
    towerId: "discount-wizard",
    padId: "puddle-perch",
  });
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
    expect(simulation.state.gold).toBe(19);
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
    expect(simulation.state.lives).toBeGreaterThanOrEqual(7);
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
    expect(target?.enemyId).toBe("tax-troll");

    const result = simulation.dispatch({ type: "activate-ability" });

    expect(result.events).toContainEqual({
      type: "ability-activated",
      targetInstanceId: target?.id,
      damageDealt: 176,
    });
    expect(result.state.enemies[0]?.health).toBe(69);
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

  it("supports a complete victory with a varied tactical build", () => {
    const simulation = createSimulation({ seed: 123 });
    const plans: Record<number, readonly (() => void)[]> = {
      0: [
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "discount-wizard",
            padId: "puddle-perch",
          }),
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "fork-knight",
            padId: "crooked-stool",
          }),
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "fork-knight",
            padId: "turnip-stage",
          }),
      ],
      1: [
        () =>
          simulation.dispatch({
            type: "upgrade-tower",
            instanceId: "tower-1",
          }),
      ],
      2: [
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "discount-wizard",
            padId: "gate-crate",
          }),
      ],
      3: [
        () =>
          simulation.dispatch({
            type: "upgrade-tower",
            instanceId: "tower-1",
          }),
        () =>
          simulation.dispatch({
            type: "upgrade-tower",
            instanceId: "tower-4",
          }),
      ],
      4: [
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "bardbarian",
            padId: "bucket-throne",
          }),
        () =>
          simulation.dispatch({
            type: "upgrade-tower",
            instanceId: "tower-2",
          }),
      ],
      5: [
        () =>
          simulation.dispatch({
            type: "upgrade-tower",
            instanceId: "tower-4",
          }),
        () =>
          simulation.dispatch({
            type: "place-tower",
            towerId: "discount-wizard",
            padId: "mushroom-box",
          }),
      ],
    };

    while (
      simulation.state.phase !== "victory" &&
      simulation.state.phase !== "defeat"
    ) {
      if (simulation.state.phase === "preparing") {
        for (const action of plans[simulation.state.waveIndex] ?? []) {
          action();
        }
        simulation.dispatch({ type: "start-wave" });
      } else {
        simulation.step(10);
      }
    }

    expect(simulation.state.phase).toBe("victory");
    expect(simulation.state.lives).toBeGreaterThan(0);
    expect(simulation.state.completedMasteryIds).toContain("balanced-party");
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
});
