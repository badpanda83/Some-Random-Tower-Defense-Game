import type { BattleCheckpoint, LoadoutSnapshot } from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import { createEmptyLoadouts } from "./equipment.js";
import { createSimulation } from "./simulation.js";
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
