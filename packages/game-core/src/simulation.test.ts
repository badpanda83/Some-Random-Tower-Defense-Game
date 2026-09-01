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
