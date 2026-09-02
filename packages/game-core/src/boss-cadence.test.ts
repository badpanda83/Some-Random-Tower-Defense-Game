import type { BattleCheckpoint } from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import { createSimulation } from "./simulation.js";
import type { GameEvent } from "./types.js";

const rankRewards = [
  "fork-table-service",
  "wizard-actual-certification",
  "bardbarian-power-chord",
] as const;

function finalWaveCheckpoint(
  levelId: "mimic-market" | "lava-lamp-district",
): BattleCheckpoint {
  const level = levelDefinitions[levelId];
  const towerIds = ["fork-knight", "discount-wizard", "bardbarian"] as const;
  return {
    levelId,
    seed: 321,
    modifierIds: [],
    tick: 12_000,
    nextWave: level.waves.length - 1,
    lives: level.startingLives,
    gold: 2_000,
    score: 0,
    spawnedEnemies: 500,
    placements: level.pads.map((pad, index) => {
      const towerId =
        towerIds.find(
          (candidate) =>
            (!pad.allowedTowerIds || pad.allowedTowerIds.includes(candidate)) &&
            !pad.deniedTowerIds?.includes(candidate),
        ) ?? "fork-knight";
      return {
        id: `tower-${index + 1}`,
        towerId,
        padId: pad.id,
        level: 4,
      };
    }),
    metrics: {
      spentGold: 1_800,
      leakedEnemies: 0,
      soldTowers: 0,
      usedTowerIds: [...towerIds],
      maxTowersPlaced: level.pads.length,
    },
  };
}

function finishFinalWave(levelId: "mimic-market" | "lava-lamp-district"): {
  readonly events: readonly GameEvent[];
  readonly phase: string;
} {
  const simulation = createSimulation({
    checkpoint: finalWaveCheckpoint(levelId),
    unlockedRewardIds: rankRewards,
  });
  const events: GameEvent[] = [
    ...simulation.dispatch({ type: "start-wave" }).events,
  ];
  for (let safety = 0; safety < 20_000; safety += 1) {
    if (simulation.state.phase !== "active") {
      return { events, phase: simulation.state.phase };
    }
    events.push(...simulation.step(10).events);
  }
  throw new Error(`${levelId} final wave did not finish`);
}

describe("full boss cadence", () => {
  it("runs the Grand Till Mimic through both phases before M2 victory", () => {
    const result = finishFinalWave("mimic-market");
    expect(
      result.events
        .filter((event) => event.type === "boss-phase")
        .map((event) => event.stageId),
    ).toEqual(["clearance-rush", "express-checkout"]);
    expect(
      result.events.filter(
        (event) =>
          event.type === "boss-phase" &&
          event.reinforcementCallId === "express-checkout",
      ),
    ).toHaveLength(1);
    expect(result.phase).toBe("victory");
  });

  it("runs the Lava Lamp Landlord through both phases before M8 victory", () => {
    const result = finishFinalWave("lava-lamp-district");
    expect(
      result.events
        .filter((event) => event.type === "boss-phase")
        .map((event) => event.stageId),
    ).toEqual(["hardened-shell", "liquidation"]);
    expect(
      result.events.filter(
        (event) =>
          event.type === "boss-phase" &&
          event.reinforcementCallId === "final-eviction",
      ),
    ).toHaveLength(1);
    expect(result.phase).toBe("victory");
  });
});
