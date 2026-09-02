import type { BattleCheckpoint } from "@srtg/protocol";
import { describe, expect, it } from "vitest";

import { levelDefinitions } from "./content.js";
import { createSimulation } from "./simulation.js";
import type { GameEvent, Simulation } from "./types.js";

const rankRewards = [
  "fork-table-service",
  "wizard-actual-certification",
  "bardbarian-power-chord",
] as const;

function checkpoint(
  levelId: keyof typeof levelDefinitions,
  nextWave: number,
  towerCount = levelDefinitions[levelId].pads.length,
): BattleCheckpoint {
  const level = levelDefinitions[levelId];
  const towerIds = ["fork-knight", "discount-wizard", "bardbarian"] as const;
  return {
    levelId,
    seed: 123,
    modifierIds: [],
    tick: 4_000,
    nextWave,
    lives: level.startingLives,
    gold: 2_000,
    score: 0,
    spawnedEnemies: 200,
    placements: level.pads.slice(0, towerCount).map((pad, index) => ({
      id: `tower-${index + 1}`,
      towerId: towerIds[index % towerIds.length]!,
      padId: pad.id,
      level: 4,
    })),
    metrics: {
      spentGold: 1_200,
      leakedEnemies: 0,
      soldTowers: 0,
      usedTowerIds: [...towerIds],
      maxTowersPlaced: towerCount,
    },
  };
}

function finishWave(simulation: Simulation): GameEvent[] {
  const events: GameEvent[] = [];
  events.push(...simulation.dispatch({ type: "start-wave" }).events);
  for (let safety = 0; safety < 10_000; safety += 1) {
    if (simulation.state.phase !== "active") {
      return events;
    }
    events.push(...simulation.step(10).events);
  }
  throw new Error("wave did not finish");
}

describe("Act III deterministic systems", () => {
  it("telegraphs eruptions, exposes authored pads, and persists metrics", () => {
    const simulation = createSimulation({
      checkpoint: checkpoint("lava-lamp-district", 2, 2),
      unlockedRewardIds: rankRewards,
    });

    simulation.dispatch({ type: "start-wave" });
    const telegraph = simulation.step(110);
    expect(telegraph.events).toContainEqual({
      type: "environment-hazard-telegraphed",
      hazardId: "west-eruption",
    });
    const eruption = simulation.step(80);
    expect(eruption.events).toContainEqual({
      type: "environment-hazard-started",
      hazardId: "west-eruption",
      exposedPadIds: ["west-inside", "west-outside"],
    });
    expect(eruption.state.activeEnvironmentHazardIds).toEqual([
      "west-eruption",
    ]);
    expect(eruption.state.exposedPadIds).toEqual([
      "west-inside",
      "west-outside",
    ]);
    expect(eruption.state.metrics.exposedPadUses).toBe(2);
    const ended = simulation.step(320);
    expect(ended.events).toContainEqual({
      type: "environment-hazard-ended",
      hazardId: "west-eruption",
    });
    expect(ended.state.activeEnvironmentHazardIds).toEqual([]);
  });

  it("refers only the first non-boss defeat once at exactly half health", () => {
    const run = () => {
      const simulation = createSimulation({
        checkpoint: checkpoint("necromancers-networking-event", 2),
        unlockedRewardIds: rankRewards,
      });
      const events = finishWave(simulation);
      return { simulation, events };
    };

    const first = run();
    const second = run();
    const referrals = first.events.filter(
      (event) => event.type === "enemy-referred",
    );
    expect(referrals).toHaveLength(1);
    expect(referrals[0]).toMatchObject({ health: 65 });
    expect(first.simulation.state.metrics.referredWaveIndices).toEqual([2]);
    expect(first.simulation.state.metrics.referredEnemiesReachedHalfway).toBe(
      0,
    );
    expect(first.simulation.stateHash()).toBe(second.simulation.stateHash());
    expect(first.events).toEqual(second.events);
  });

  it("records a referral revived beyond halfway before it can take another hit", () => {
    const simulation = createSimulation({
      checkpoint: checkpoint("necromancers-networking-event", 4, 0),
      unlockedRewardIds: rankRewards,
    });
    simulation.dispatch({ type: "start-wave" });

    let target = simulation.state.enemies[0];
    for (let safety = 0; safety < 1_000; safety += 1) {
      simulation.step();
      target = [...simulation.state.enemies].sort(
        (left, right) => right.pathDistanceMilli - left.pathDistanceMilli,
      )[0];
      if (target && simulation.getEnemyPosition(target).x >= 650) {
        break;
      }
    }
    expect(target).toBeDefined();

    const result = simulation.dispatch({ type: "activate-ability" });
    const referralEvent = result.events.find(
      (event) => event.type === "enemy-referred",
    );
    expect(referralEvent?.type).toBe("enemy-referred");
    expect(result.events).toContainEqual({
      type: "referred-enemy-reached-halfway",
      instanceId:
        referralEvent?.type === "enemy-referred"
          ? referralEvent.referredInstanceId
          : "",
    });
    expect(result.state.metrics.referredEnemiesReachedHalfway).toBe(1);
  });

  it("restores cumulative referral mastery state from a between-wave checkpoint", () => {
    const original = createSimulation({
      checkpoint: checkpoint("necromancers-networking-event", 2),
      unlockedRewardIds: rankRewards,
    });
    finishWave(original);
    const saved = original.createCheckpoint();
    expect(saved?.metrics.referredWaveIndices).toEqual([2]);

    const restored = createSimulation({
      checkpoint: saved!,
      unlockedRewardIds: rankRewards,
    });
    expect(restored.state.metrics.referredWaveIndices).toEqual([2]);
    expect(restored.state.metrics.referredEnemiesReachedHalfway).toBe(
      original.state.metrics.referredEnemiesReachedHalfway,
    );
    expect(restored.state.enemies).toEqual([]);
    expect(restored.stateHash()).toBe(original.stateHash());
  });

  it("runs all three final boss stages, one reinforcement call, and wins", () => {
    const simulation = createSimulation({
      checkpoint: checkpoint("quarterly-dragon-review", 9),
      unlockedRewardIds: rankRewards,
    });
    const events = finishWave(simulation);
    const stages = events
      .filter((event) => event.type === "boss-phase")
      .map((event) => event.stageId);

    expect(stages).toEqual(["armored-review", "rage-reforecast"]);
    expect(
      events.filter(
        (event) =>
          event.type === "boss-phase" &&
          event.reinforcementCallId === "final-reinforcement",
      ),
    ).toHaveLength(1);
    expect(simulation.state.metrics.bossReinforcementCalls).toEqual({
      "final-reinforcement": 1,
    });
    expect(simulation.state.phase).toBe("victory");
  });
});
