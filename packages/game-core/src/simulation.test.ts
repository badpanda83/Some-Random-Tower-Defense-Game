import { describe, expect, it } from "vitest";

import { muddyMoatLevel } from "./content.js";
import { createSimulation } from "./simulation.js";

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

    expect(simulation.state.gold).toBe(muddyMoatLevel.startingGold - 60);
    expect(simulation.state.metrics.spentGold).toBe(60);
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
    expect(simulation.state.gold).toBe(55);
    expect(simulation.state.metrics.spentGold).toBe(215);
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
        type: "place-tower",
        towerId: "discount-wizard",
        padId: "bramble-seat",
      }),
    ).toThrow("Not enough gold");
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
        type: "upgrade-tower",
        instanceId: "tower-1",
      }),
    ).toThrow("Not enough gold");
    expect(simulation.state.phase).toBe("active");
    expect(simulation.state.gold).toBe(10);
    expect(simulation.state.towers).toHaveLength(1);
    expect(simulation.state.towers[0]?.level).toBe(2);
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
});
