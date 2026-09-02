import type { BattleCheckpoint, LoadoutSnapshot } from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { enemyDefinitions, levelDefinitions } from "./content.js";
import { createEmptyLoadouts } from "./equipment.js";
import { compareTowerInstanceIds, createSimulation } from "./simulation.js";
import type { GameEvent } from "./types.js";

function checkpoint(
  levelId: keyof typeof levelDefinitions,
  seed: number,
  nextWave = 0,
): BattleCheckpoint {
  const level = levelDefinitions[levelId];
  return {
    levelId,
    seed,
    modifierIds: [],
    tick: 0,
    nextWave,
    lives: level.startingLives,
    gold: 2_000,
    score: 0,
    spawnedEnemies: 0,
    placements: [],
    metrics: {
      spentGold: 0,
      leakedEnemies: 0,
      soldTowers: 0,
      usedTowerIds: [],
    },
  };
}

function completeCurrentWave(
  simulation: ReturnType<typeof createSimulation>,
): readonly GameEvent[] {
  const events: GameEvent[] = [
    ...simulation.dispatch({ type: "start-wave" }).events,
  ];
  for (let safety = 0; safety < 20_000; safety += 1) {
    if (simulation.state.phase !== "active") {
      return events;
    }
    events.push(...simulation.step(10).events);
  }
  throw new Error("Wave exceeded safety limit");
}

function staffedCheckpoint(
  levelId: keyof typeof levelDefinitions,
  seed: number,
  loadoutSnapshot: LoadoutSnapshot,
): BattleCheckpoint {
  const value = checkpoint(levelId, seed);
  value.loadoutSnapshot = loadoutSnapshot;
  value.placements = levelDefinitions[levelId].pads.flatMap((pad, index) =>
    (!pad.allowedTowerIds || pad.allowedTowerIds.includes("discount-wizard")) &&
    !pad.deniedTowerIds?.includes("discount-wizard")
      ? [
          {
            id: `tower-${index + 1}`,
            towerId: "discount-wizard",
            padId: pad.id,
            level: 4,
          },
        ]
      : [],
  );
  value.metrics.usedTowerIds = ["discount-wizard"];
  value.metrics.maxTowersPlaced = value.placements.length;
  return value;
}

describe("equipment simulation replay", () => {
  it("snapshots loadouts and split RNG state through a checkpoint round trip", () => {
    const loadouts: LoadoutSnapshot = {
      ...createEmptyLoadouts(),
      "discount-wizard": {
        weapon: "wand-of-definitely-winter",
        armor: null,
        charm: null,
      },
    };
    const initial = staffedCheckpoint("muddy-moat", 5, loadouts);
    initial.attemptId = "attempt-checkpoint";
    const original = createSimulation({
      checkpoint: initial,
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    completeCurrentWave(original);
    const saved = original.createCheckpoint();
    expect(saved).not.toBeNull();
    expect(saved?.attemptId).toBe("attempt-checkpoint");
    expect(saved?.loadoutSnapshot).toEqual(loadouts);
    expect(saved?.rngState?.spawn).toBeGreaterThan(0);
    expect(saved?.rngState?.combat).toBeGreaterThan(0);

    const restored = createSimulation({
      checkpoint: saved!,
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    expect(restored.stateHash()).toBe(original.stateHash());
    expect(completeCurrentWave(restored)).toEqual(
      completeCurrentWave(original),
    );
    expect(restored.stateHash()).toBe(original.stateHash());
  });

  it("keeps spawn variants independent from combat proc consumption", () => {
    const empty = createEmptyLoadouts();
    const baseline = createSimulation({
      checkpoint: staffedCheckpoint("muddy-moat", 5, empty),
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    const equipped = createSimulation({
      checkpoint: staffedCheckpoint("muddy-moat", 5, {
        ...createEmptyLoadouts(),
        "discount-wizard": {
          weapon: "wand-of-definitely-winter",
          armor: null,
          charm: null,
        },
      }),
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    completeCurrentWave(baseline);
    completeCurrentWave(equipped);

    expect(equipped.state.rngState.spawn).toBe(baseline.state.rngState.spawn);
    expect(equipped.state.rngState.combat).not.toBe(
      baseline.state.rngState.combat,
    );
  });

  it("emits visible deterministic boss conversion events", () => {
    const level = levelDefinitions["mimic-market"];
    const bossCheckpoint = checkpoint(
      "mimic-market",
      5,
      level.waves.length - 1,
    );
    bossCheckpoint.placements = level.pads.flatMap((pad, index) =>
      (!pad.allowedTowerIds || pad.allowedTowerIds.includes("fork-knight")) &&
      !pad.deniedTowerIds?.includes("fork-knight")
        ? [
            {
              id: `tower-${index + 1}`,
              towerId: "fork-knight",
              padId: pad.id,
              level: 4,
            },
          ]
        : [],
    );
    bossCheckpoint.metrics.usedTowerIds = ["fork-knight"];
    bossCheckpoint.metrics.maxTowersPlaced = bossCheckpoint.placements.length;
    bossCheckpoint.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "fork-knight": {
        weapon: "excalifork",
        armor: null,
        charm: null,
      },
    };

    const simulation = createSimulation({
      checkpoint: bossCheckpoint,
      unlockedRewardIds: ["fork-table-service"],
    });
    const events = completeCurrentWave(simulation);
    const conversion = events.find(
      (event) =>
        event.type === "equipment-effect" &&
        event.outcome === "converted" &&
        event.message.includes("Boss resisted"),
    );
    expect(conversion).toBeDefined();
  });

  it("reports only post-threshold damage when a boss phase clamps health", () => {
    const level = levelDefinitions["mimic-market"];
    const bossCheckpoint = checkpoint(
      "mimic-market",
      5,
      level.waves.length - 1,
    );
    bossCheckpoint.placements = level.pads.flatMap((pad, index) =>
      (!pad.allowedTowerIds || pad.allowedTowerIds.includes("fork-knight")) &&
      !pad.deniedTowerIds?.includes("fork-knight")
        ? [
            {
              id: `tower-${index + 1}`,
              towerId: "fork-knight",
              padId: pad.id,
              level: 4,
            },
          ]
        : [],
    );
    bossCheckpoint.metrics.usedTowerIds = ["fork-knight"];
    bossCheckpoint.metrics.maxTowersPlaced = bossCheckpoint.placements.length;
    const simulation = createSimulation({
      checkpoint: bossCheckpoint,
      unlockedRewardIds: ["fork-table-service"],
    });
    simulation.dispatch({ type: "start-wave" });

    let bossId: string | null = null;
    for (let safety = 0; safety < 20_000; safety += 1) {
      const healthBefore = bossId
        ? simulation.state.enemies.find((enemy) => enemy.id === bossId)?.health
        : undefined;
      const result = simulation.step(1);
      const spawn = result.events.find(
        (event) =>
          event.type === "enemy-spawned" &&
          event.enemyId === "grand-till-mimic",
      );
      if (spawn?.type === "enemy-spawned") {
        bossId = spawn.instanceId;
      }
      if (
        bossId &&
        healthBefore !== undefined &&
        result.events.some(
          (event) => event.type === "boss-phase" && event.instanceId === bossId,
        )
      ) {
        const healthAfter = result.state.enemies.find(
          (enemy) => enemy.id === bossId,
        )?.health;
        const reportedDamage = result.events.reduce(
          (total, event) =>
            event.type === "tower-attacked" &&
            event.affectedInstanceIds.includes(bossId!)
              ? total + event.damageDealt
              : total,
          0,
        );
        expect(healthAfter).toBeDefined();
        expect(reportedDamage).toBe(healthBefore - healthAfter!);
        return;
      }
    }
    throw new Error("Boss did not cross a phase threshold");
  });

  it("does not count a primary control proc rejected by immunity", () => {
    const value = checkpoint("quarterly-dragon-review", 19, 7);
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "discount-wizard": {
        weapon: "wand-of-definitely-winter",
        armor: null,
        charm: null,
      },
    };
    value.placements = [
      {
        id: "tower-1",
        towerId: "discount-wizard",
        padId: "warehouse-door",
        level: 4,
      },
    ];
    value.metrics.usedTowerIds = ["discount-wizard"];
    value.metrics.maxTowersPlaced = 1;
    value.rngState = { spawn: 1, combat: 1 };
    const simulation = createSimulation({
      checkpoint: value,
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    simulation.dispatch({ type: "start-wave" });

    for (let safety = 0; safety < 2_000; safety += 1) {
      const result = simulation.step(1);
      const immune = result.events.find(
        (event) =>
          event.type === "equipment-effect" &&
          event.effectId === "definitely-winter-freeze" &&
          event.outcome === "immune",
      );
      if (immune) {
        expect(
          simulation.state.metrics.equipment["wand-of-definitely-winter"]
            ?.procCount ?? 0,
        ).toBe(0);
        return;
      }
    }
    throw new Error("Queue Jumper did not reject the control proc");
  });

  it("does not count a primary control proc rejected during resolve", () => {
    const value = checkpoint("quarterly-dragon-review", 23, 6);
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "discount-wizard": {
        weapon: "wand-of-definitely-winter",
        armor: null,
        charm: null,
      },
    };
    value.placements = levelDefinitions["quarterly-dragon-review"].pads.map(
      (pad, index) => ({
        id: `tower-${index + 1}`,
        towerId: "discount-wizard",
        padId: pad.id,
        level: 1,
      }),
    );
    value.metrics.usedTowerIds = ["discount-wizard"];
    value.metrics.maxTowersPlaced = value.placements.length;
    value.rngState = { spawn: 1, combat: 77_880 };
    const simulation = createSimulation({ checkpoint: value });
    simulation.dispatch({ type: "start-wave" });

    const controlEvents: GameEvent[] = [];
    for (let safety = 0; safety < 2_000; safety += 1) {
      const result = simulation.step(1);
      controlEvents.push(
        ...result.events.filter(
          (event) =>
            event.type === "equipment-effect" &&
            event.effectId === "definitely-winter-freeze",
        ),
      );
      if (
        controlEvents.some(
          (event) =>
            event.type === "equipment-effect" && event.outcome === "rejected",
        )
      ) {
        const appliedCount = controlEvents.filter(
          (event) =>
            event.type === "equipment-effect" && event.outcome === "applied",
        ).length;
        expect(
          simulation.state.metrics.equipment["wand-of-definitely-winter"]
            ?.procCount ?? 0,
        ).toBe(appliedCount);
        return;
      }
    }
    throw new Error("A synchronized control proc was not rejected by resolve");
  });

  it("does not count synchronized counters suppressed by a shared cooldown", () => {
    const value = checkpoint("quarterly-dragon-review", 11);
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      bardbarian: {
        weapon: null,
        armor: null,
        charm: "the-forbidden-power-chord",
      },
    };
    const padIds = ["warehouse-door", "courtyard-door"];
    value.placements = Array.from({ length: 2 }, (_, index) => ({
      id: `tower-${index + 1}`,
      towerId: "bardbarian",
      padId: padIds[index]!,
      level: 4,
    }));
    value.metrics.usedTowerIds = ["bardbarian"];
    value.metrics.maxTowersPlaced = 2;
    value.equipmentProcState = {
      counters: {
        "tower-1:forbidden-chorus": 9,
        "tower-2:forbidden-chorus": 9,
      },
      cooldownUntilTicks: {},
      oncePerWaveIds: [],
      oncePerBattleIds: [],
      teamCooldownUntilTicks: { "forbidden-chorus": 10_000 },
      targetCaps: {},
      activeBuffUntilTicks: {},
    };
    const simulation = createSimulation({
      checkpoint: value,
      unlockedRewardIds: ["bardbarian-power-chord"],
    });
    simulation.dispatch({ type: "start-wave" });

    const attackingTowers = new Set<string>();
    const effectEvents: GameEvent[] = [];
    for (
      let safety = 0;
      safety < 2_000 && attackingTowers.size === 0;
      safety += 1
    ) {
      const result = simulation.step(1);
      for (const event of result.events) {
        if (event.type === "tower-attacked") {
          attackingTowers.add(event.instanceId);
        }
        if (
          event.type === "equipment-effect" &&
          event.effectId === "forbidden-chorus"
        ) {
          effectEvents.push(event);
        }
      }
    }

    expect(attackingTowers.size).toBeGreaterThan(0);
    expect(effectEvents).toHaveLength(0);
    expect(
      simulation.state.metrics.equipment["the-forbidden-power-chord"]
        ?.procCount ?? 0,
    ).toBe(0);
  });

  it("does not count an echo counter when its primary target is gone", () => {
    const value = checkpoint("muddy-moat", 13);
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "discount-wizard": {
        weapon: null,
        armor: "robes-of-the-second-draft",
        charm: "royal-participation-trophy",
      },
    };
    value.placements = [
      {
        id: "tower-1",
        towerId: "discount-wizard",
        padId: levelDefinitions["muddy-moat"].pads[0]!.id,
        level: 4,
      },
      {
        id: "tower-2",
        towerId: "bardbarian",
        padId: levelDefinitions["muddy-moat"].pads[1]!.id,
        level: 1,
      },
    ];
    value.metrics.usedTowerIds = ["discount-wizard", "bardbarian"];
    value.metrics.maxTowersPlaced = 2;
    value.equipmentProcState = {
      counters: { "tower-1:second-draft-repeat": 3 },
      cooldownUntilTicks: {},
      oncePerWaveIds: [],
      oncePerBattleIds: [],
      teamCooldownUntilTicks: {},
      targetCaps: {},
      activeBuffUntilTicks: {},
    };
    const simulation = createSimulation({
      checkpoint: value,
      unlockedRewardIds: ["wizard-actual-certification"],
    });
    simulation.dispatch({ type: "start-wave" });

    let attackEvents: readonly GameEvent[] = [];
    for (
      let safety = 0;
      safety < 2_000 && attackEvents.length === 0;
      safety += 1
    ) {
      const result = simulation.step(1);
      if (result.events.some((event) => event.type === "tower-attacked")) {
        attackEvents = result.events;
      }
    }

    expect(attackEvents.some((event) => event.type === "tower-attacked")).toBe(
      true,
    );
    expect(
      attackEvents.some(
        (event) =>
          event.type === "equipment-effect" &&
          event.effectId === "second-draft-repeat",
      ),
    ).toBe(false);
    expect(
      simulation.state.metrics.equipment["robes-of-the-second-draft"]
        ?.procCount ?? 0,
    ).toBe(0);
  });

  it("prevents only the first normal leak while retaining leak metrics", () => {
    const value = checkpoint("muddy-moat", 29);
    value.lives = 999;
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "fork-knight": {
        weapon: null,
        armor: "oven-mitts-of-holding",
        charm: null,
      },
    };
    value.placements = [
      {
        id: "tower-1",
        towerId: "fork-knight",
        padId: "bramble-seat",
        level: 1,
      },
    ];
    value.metrics.usedTowerIds = ["fork-knight"];
    value.metrics.maxTowersPlaced = 1;
    const simulation = createSimulation({ checkpoint: value });
    const events = completeCurrentWave(simulation);
    const leaks = events.filter((event) => event.type === "enemy-leaked");

    expect(leaks.length).toBeGreaterThan(1);
    expect(leaks[0]?.damage).toBe(0);
    expect(leaks[1]?.damage).toBe(1);
    expect(simulation.state.metrics.leakedEnemies).toBe(leaks.length);
    expect(
      simulation.state.metrics.equipment["oven-mitts-of-holding"],
    ).toMatchObject({
      procCount: 1,
      lifeDamagePrevented: 1,
    });
  });

  it("never prevents boss leak damage", () => {
    const level = levelDefinitions["mimic-market"];
    const value = checkpoint("mimic-market", 31, level.waves.length - 1);
    value.lives = 999;
    value.loadoutSnapshot = {
      ...createEmptyLoadouts(),
      "fork-knight": {
        weapon: null,
        armor: "oven-mitts-of-holding",
        charm: null,
      },
    };
    const simulation = createSimulation({ checkpoint: value });
    simulation.dispatch({ type: "start-wave" });

    let bossId: string | null = null;
    let towerPlaced = false;
    for (let safety = 0; safety < 20_000; safety += 1) {
      const result = simulation.step(1);
      const bossSpawn = result.events.find(
        (event) =>
          event.type === "enemy-spawned" &&
          event.enemyId === "grand-till-mimic",
      );
      if (bossSpawn?.type === "enemy-spawned") {
        bossId = bossSpawn.instanceId;
      }
      if (
        bossId &&
        !towerPlaced &&
        simulation.state.enemies.length === 1 &&
        simulation.state.enemies[0]?.id === bossId
      ) {
        simulation.dispatch({
          type: "place-tower",
          towerId: "fork-knight",
          padId: level.pads[0]!.id,
        });
        towerPlaced = true;
      }
      const bossLeak = result.events.find(
        (event) => event.type === "enemy-leaked" && event.instanceId === bossId,
      );
      if (bossLeak?.type === "enemy-leaked") {
        expect(towerPlaced).toBe(true);
        expect(bossLeak.damage).toBe(
          enemyDefinitions["grand-till-mimic"].lifeDamage,
        );
        expect(
          simulation.state.metrics.equipment["oven-mitts-of-holding"]
            ?.lifeDamagePrevented ?? 0,
        ).toBe(0);
        return;
      }
    }
    throw new Error("Grand Till Mimic did not leak");
  });

  it("orders more than nine tower instances numerically on replay", () => {
    const checkpointOrder = [
      "tower-1",
      "tower-10",
      "tower-11",
      "tower-2",
      "tower-3",
      "tower-4",
      "tower-5",
      "tower-6",
      "tower-7",
      "tower-8",
      "tower-9",
    ];
    const expected = Array.from(
      { length: 11 },
      (_, index) => `tower-${index + 1}`,
    );

    expect([...checkpointOrder].sort(compareTowerInstanceIds)).toEqual(
      expected,
    );
    expect([...checkpointOrder].sort(compareTowerInstanceIds)).toEqual(
      expected,
    );
  });

  it("preserves discounted invested gold across checkpoint restore and sale", () => {
    const loadouts: LoadoutSnapshot = {
      ...createEmptyLoadouts(),
      "fork-knight": {
        weapon: null,
        armor: "cardboard-cuirass-deluxe-ish",
        charm: null,
      },
    };
    const original = createSimulation({
      levelId: "muddy-moat",
      seed: 3,
      loadoutSnapshot: loadouts,
    });
    const pad = levelDefinitions["muddy-moat"].pads[0]!;
    original.dispatch({
      type: "place-tower",
      towerId: "fork-knight",
      padId: pad.id,
    });
    const saved = original.createCheckpoint()!;
    const restored = createSimulation({ checkpoint: saved });

    original.dispatch({ type: "sell-tower", instanceId: "tower-1" });
    restored.dispatch({ type: "sell-tower", instanceId: "tower-1" });
    expect(restored.state.gold).toBe(original.state.gold);
    expect(saved.placements[0]?.investedGold).toBe(53);
  });

  it("activates secondary slow and leak haste MVP effects", () => {
    const bardLoadouts: LoadoutSnapshot = {
      ...createEmptyLoadouts(),
      bardbarian: {
        weapon: null,
        armor: "cape-of-the-second-chance",
        charm: "backup-dancer-in-a-jar",
      },
    };
    const weak = checkpoint("muddy-moat", 8);
    weak.loadoutSnapshot = bardLoadouts;
    const pad = levelDefinitions["muddy-moat"].pads[0]!;
    weak.placements = [
      {
        id: "tower-1",
        towerId: "bardbarian",
        padId: pad.id,
        level: 1,
      },
    ];
    weak.metrics.usedTowerIds = ["bardbarian"];
    weak.metrics.maxTowersPlaced = 1;
    const simulation = createSimulation({ checkpoint: weak });
    const events = completeCurrentWave(simulation);
    expect(
      events.some(
        (event) =>
          event.type === "equipment-effect" &&
          event.effectId === "backup-dancer-slow",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "equipment-effect" &&
          event.effectId === "second-chance-haste",
      ),
    ).toBe(true);
  });
});
