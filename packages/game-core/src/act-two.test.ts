import { describe, expect, it } from "vitest";

import {
  departmentOfUnnecessaryBridgesLevel,
  frozenAssetsLevel,
  siegeAndDesistLevel,
} from "./content.js";
import { createSimulation } from "./simulation.js";
import type { BattleCheckpoint } from "@srtg/protocol";

describe("Act II multi-route framework", () => {
  it("walks a spawn down its declared route rather than the level's default path", () => {
    const simulation = createSimulation({
      levelId: "frozen-assets",
      seed: 9,
      checkpoint: undefined,
    });

    // Directly exercise the two authored routes by placing no towers and
    // letting wave 1 (which spawns on both "north-shore" and "south-shore")
    // run; every enemy should end up on a position consistent with its own
    // route rather than collapsing onto a single shared path.
    simulation.dispatch({ type: "start-wave" });
    simulation.step(45);

    const enemies = simulation.state.enemies;
    expect(enemies.length).toBeGreaterThan(0);
    const routeIds = new Set(enemies.map((enemy) => enemy.routeId));
    expect(routeIds.has("north-shore")).toBe(true);
    expect(routeIds.has("south-shore")).toBe(true);

    for (const enemy of enemies) {
      const position = simulation.getEnemyPosition(enemy);
      const route = frozenAssetsLevel.routes!.find(
        (candidate) => candidate.id === enemy.routeId,
      );
      expect(route).toBeDefined();
      // North-shore enemies start near y=120, south-shore near y=420; they
      // must never be walking the other lane's geometry.
      if (enemy.routeId === "north-shore") {
        expect(position.y).toBeLessThan(270);
      } else if (enemy.routeId === "south-shore") {
        expect(position.y).toBeGreaterThan(270);
      }
    }
  });

  it("records leaks against the wave they occurred in, independent of route", () => {
    const simulation = createSimulation({ levelId: "frozen-assets", seed: 3 });
    simulation.dispatch({ type: "start-wave" });

    let safety = 0;
    while (simulation.state.enemies.length === 0 && safety < 200) {
      simulation.step(1);
      safety += 1;
    }
    // Let the entire undefended wave 1 walk to the vault and leak.
    while (
      simulation.state.phase === "active" &&
      simulation.state.waveIndex === 0 &&
      safety < 5_000
    ) {
      simulation.step(10);
      safety += 1;
    }

    expect(simulation.state.metrics.leakedEnemies).toBeGreaterThan(0);
    expect(simulation.state.metrics.leakedByWaveIndex["0"]).toBe(
      simulation.state.metrics.leakedEnemies,
    );
  });

  it("rejects Fork Knight on thin-ice pads while allowing other towers", () => {
    const simulation = createSimulation({ levelId: "frozen-assets", seed: 1 });
    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "fork-knight",
        padId: "vault-gate",
      }),
    ).toThrow(/cannot be placed/i);

    expect(() =>
      simulation.dispatch({
        type: "place-tower",
        towerId: "discount-wizard",
        padId: "vault-gate",
      }),
    ).not.toThrow();
  });

  it("speeds enemies inside a marked speed zone on their own route only", () => {
    const simulation = createSimulation({ levelId: "frozen-assets", seed: 4 });
    simulation.dispatch({ type: "start-wave" });

    // Advance until at least one enemy has crossed into the marked zone
    // (40%-72% of the route) and compare its per-tick advance against an
    // enemy still walking the unmarked start of the route.
    let sawZoneBoost = false;
    for (
      let tick = 0;
      tick < 3_000 && simulation.state.phase === "active";
      tick += 1
    ) {
      const before = new Map(
        simulation.state.enemies.map((enemy) => [
          enemy.id,
          enemy.pathDistanceMilli,
        ]),
      );
      simulation.step(1);
      for (const enemy of simulation.state.enemies) {
        const previous = before.get(enemy.id);
        if (previous === undefined) {
          continue;
        }
        const route = frozenAssetsLevel.routes!.find(
          (candidate) => candidate.id === enemy.routeId,
        )!;
        const totalLength = route.path.reduce((total, point, index) => {
          if (index === 0) return 0;
          const prior = route.path[index - 1]!;
          return (
            total + Math.hypot(point.x - prior.x, point.y - prior.y) * 1000
          );
        }, 0);
        const progressPercent = (previous / totalLength) * 100;
        if (progressPercent >= 40 && progressPercent <= 72) {
          const delta = enemy.pathDistanceMilli - previous;
          // Baseline goblin speed(58) * TICK_MS(50) / 1000 ~= 2900 milli per
          // tick at 100%; the zone multiplies by 128%, so any advance well
          // above baseline confirms the zone applied.
          if (delta > 3_200) {
            sawZoneBoost = true;
          }
        }
      }
      if (sawZoneBoost) {
        break;
      }
    }

    expect(sawZoneBoost).toBe(true);
  });

  it("applies arcane resistance and physical vulnerability to Warranty Wraith", () => {
    function firstWraithHit(towerId: "discount-wizard" | "fork-knight") {
      const checkpoint: BattleCheckpoint = {
        levelId: "frozen-assets",
        seed: 1,
        modifierIds: [],
        tick: 0,
        nextWave: 5,
        lives: 12,
        gold: 0,
        score: 0,
        spawnedEnemies: 0,
        placements: [
          {
            id: "tower-1",
            towerId,
            padId: "counting-house-ledge",
            level: 3,
          },
        ],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [towerId],
        },
      };
      const simulation = createSimulation({ checkpoint });
      simulation.dispatch({ type: "start-wave" });
      for (let tick = 0; tick < 2_000; tick += 1) {
        const before = new Map(
          simulation.state.enemies
            .filter((enemy) => enemy.enemyId === "warranty-wraith")
            .map((enemy) => [enemy.id, enemy.health]),
        );
        simulation.step(1);
        for (const enemy of simulation.state.enemies) {
          const priorHealth = before.get(enemy.id);
          if (priorHealth !== undefined && enemy.health < priorHealth) {
            return priorHealth - enemy.health;
          }
        }
      }
      throw new Error(`${towerId} never hit a Warranty Wraith`);
    }

    expect(firstWraithHit("discount-wizard")).toBe(33);
    expect(firstWraithHit("fork-knight")).toBe(84);
  });

  it("splits a defeated Refund Slime into two goblins at the same position and route", () => {
    const level = siegeAndDesistLevel;
    const checkpoint: BattleCheckpoint = {
      levelId: "siege-and-desist",
      seed: 1,
      modifierIds: [],
      tick: 0,
      nextWave: 5, // "Refund Department" (0-indexed wave 5)
      lives: 14,
      gold: 400,
      score: 0,
      spawnedEnemies: 0,
      placements: level.pads.slice(0, 6).map((pad, index) => ({
        id: `tower-${index + 1}`,
        towerId: index % 2 === 0 ? "fork-knight" : "discount-wizard",
        padId: pad.id,
        level: 3,
      })),
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    };
    expect(level.waves[5]?.name).toBe("Refund Department");
    const simulation = createSimulation({ checkpoint });
    simulation.dispatch({ type: "start-wave" });

    let splitOrigin:
      | { readonly routeId: string; readonly pathDistanceMilli: number }
      | undefined;
    let childIds: readonly string[] = [];
    for (let tick = 0; tick < 2_000 && childIds.length === 0; tick += 1) {
      const before = new Map(
        simulation.state.enemies
          .filter((enemy) => enemy.enemyId === "refund-slime")
          .map((enemy) => [enemy.id, enemy]),
      );
      const result = simulation.step(1);
      const defeated = result.events.find(
        (event) =>
          event.type === "enemy-defeated" && before.has(event.instanceId),
      );
      if (defeated) {
        splitOrigin = before.get(defeated.instanceId);
        childIds = result.events
          .filter(
            (event) =>
              event.type === "enemy-spawned" &&
              event.enemyId === "basic-goblin",
          )
          .map((event) => event.instanceId);
      }
    }

    expect(splitOrigin).toBeDefined();
    expect(childIds).toHaveLength(2);
    expect(simulation.state.metrics.splitSpawns).toBeGreaterThanOrEqual(2);
    const children = simulation.state.enemies.filter((enemy) =>
      childIds.includes(enemy.id),
    );
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.routeId).toBe(splitOrigin!.routeId);
      expect(child.pathDistanceMilli).toBeGreaterThanOrEqual(
        splitOrigin!.pathDistanceMilli,
      );
      expect(
        child.pathDistanceMilli - splitOrigin!.pathDistanceMilli,
      ).toBeLessThan(5_000);
    }
  });

  it("runs the Queen of Pending Litigation through both authored boss phases", () => {
    const level = siegeAndDesistLevel;
    const finalWaveIndex = level.waves.length - 1;
    expect(level.waves[finalWaveIndex]?.name).toBe(
      "Queen of Pending Litigation",
    );

    const checkpoint: BattleCheckpoint = {
      levelId: "siege-and-desist",
      seed: 5,
      modifierIds: [],
      tick: 0,
      nextWave: finalWaveIndex,
      lives: 14,
      gold: 0,
      score: 0,
      spawnedEnemies: 0,
      placements: level.pads.map((pad, index) => ({
        id: `tower-${index + 1}`,
        towerId:
          index % 3 === 0
            ? "discount-wizard"
            : index % 3 === 1
              ? "fork-knight"
              : "bardbarian",
        padId: pad.id,
        level: 4,
      })),
      metrics: {
        spentGold: 2_000,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: ["discount-wizard", "fork-knight", "bardbarian"],
      },
    };

    const simulation = createSimulation({
      checkpoint,
      unlockedRewardIds: [
        "fork-table-service",
        "wizard-actual-certification",
        "bardbarian-power-chord",
      ],
    });
    simulation.dispatch({ type: "start-wave" });

    let queenId: string | null = null;
    let phaseCount = 0;
    let sawEscort = false;
    let sawWardBlockFirstHit = false;

    for (
      let tick = 0;
      tick < 6_000 && simulation.state.phase === "active";
      tick += 1
    ) {
      const result = simulation.step(1);
      for (const event of result.events) {
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "queen-of-pending-litigation"
        ) {
          queenId = event.instanceId;
        }
        if (
          event.type === "tower-attacked" &&
          event.affectedInstanceIds.includes(queenId ?? "__none__") &&
          event.damageDealt === 0 &&
          phaseCount === 0
        ) {
          sawWardBlockFirstHit = true;
        }
        if (event.type === "boss-phase" && event.instanceId === queenId) {
          phaseCount += 1;
        }
        if (
          event.type === "enemy-spawned" &&
          event.enemyId === "middle-manager-mage" &&
          queenId !== null
        ) {
          sawEscort = true;
        }
      }
      if (phaseCount >= 2) {
        break;
      }
    }

    expect(queenId).not.toBeNull();
    expect(sawWardBlockFirstHit).toBe(true);
    expect(sawEscort).toBe(true);
    expect(phaseCount).toBe(2);
  });

  it("preserves new metrics across a between-wave checkpoint round trip", () => {
    const simulation = createSimulation({
      levelId: "department-of-unnecessary-bridges",
      seed: 1,
    });
    for (const pad of departmentOfUnnecessaryBridgesLevel.pads) {
      const towerId = pad.deniedTowerIds?.includes("fork-knight")
        ? "discount-wizard"
        : "fork-knight";
      simulation.dispatch({ type: "place-tower", towerId, padId: pad.id });
    }
    simulation.dispatch({ type: "start-wave" });
    while (simulation.state.phase === "active") {
      simulation.step(20);
    }
    expect(simulation.state.phase).toBe("preparing");

    const checkpoint = simulation.createCheckpoint();
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.metrics).toHaveProperty("leakedByWaveIndex");
    expect(checkpoint!.metrics).toHaveProperty("splitSpawns");
    expect(checkpoint!.metrics).toHaveProperty("abilityActivations");
    expect(checkpoint!.metrics).toHaveProperty("lastEnemyClearedTick");

    const restored = createSimulation({ checkpoint: checkpoint! });
    expect(restored.state.metrics).toEqual(simulation.state.metrics);
    expect(restored.stateHash()).toBe(simulation.stateHash());
  });

  it("keeps cluster-shutdown pads on the keep synchronized across waves", () => {
    const clusterPads = siegeAndDesistLevel.pads.filter(
      (pad) => pad.clusterId === "keep-cluster",
    );
    expect(clusterPads.length).toBeGreaterThanOrEqual(3);
    const waveIndexSets = clusterPads.map(
      (pad) => new Set(pad.shutdowns?.map((shutdown) => shutdown.waveIndex)),
    );
    const [first, ...rest] = waveIndexSets;
    for (const set of rest) {
      expect([...set!].sort()).toEqual([...first!].sort());
    }
  });

  it("keeps bridge-island shared pads reachable from both routes", () => {
    const level = departmentOfUnnecessaryBridgesLevel;
    const sharedPads = level.pads.filter((pad) => pad.laneId === "shared");
    expect(sharedPads.length).toBeGreaterThan(0);
    for (const pad of sharedPads) {
      expect(pad.clusterId).toBe("bridge-islands");
    }
  });
});
