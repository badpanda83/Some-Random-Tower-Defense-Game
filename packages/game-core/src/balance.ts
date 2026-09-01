import { levelDefinitions, towerDefinitions } from "./content.js";
import { createSimulation } from "./simulation.js";
import { ROYAL_FORKFALL_CHARGE_TICKS, TICK_RATE } from "./types.js";
import type { GameEvent } from "./types.js";

type TowerId = keyof typeof towerDefinitions;
export type ActOneLevelId =
  "muddy-moat" | "mimic-market" | "troll-tollway" | "castle-hassle";

export interface ReferenceStrategy {
  readonly id: string;
  readonly towerPattern: readonly TowerId[];
  readonly maxTowers?: number;
  readonly spendingLimit?: number;
}

export interface TowerContribution {
  readonly attacks: number;
  readonly targetHits: number;
  readonly damageDealt: number;
  readonly defeatedEnemies: number;
}

export interface WaveBalanceReport {
  readonly wave: number;
  readonly ticks: number;
  readonly seconds: number;
  readonly livesAfter: number;
  readonly goldAfter: number;
  readonly peakEnemies: number;
}

export interface BuildActionReport {
  readonly beforeWave: number;
  readonly action: "place" | "upgrade";
  readonly towerId: string;
  readonly padId: string;
  readonly resultingLevel: number;
  readonly cost: number;
}

export interface MissionBalanceReport {
  readonly levelId: ActOneLevelId;
  readonly strategyId: string;
  readonly result: "victory" | "defeat";
  readonly activeTicks: number;
  readonly activeMinutes: number;
  readonly planningActions: number;
  readonly planningMinutes: number;
  readonly representativeMinutes: number;
  readonly lives: number;
  readonly gold: number;
  readonly leakedByEnemyId: Readonly<Record<string, number>>;
  readonly towers: number;
  readonly peakEnemies: number;
  readonly completedMasteryIds: readonly string[];
  readonly buildActions: readonly BuildActionReport[];
  readonly waves: readonly WaveBalanceReport[];
  readonly contributionByTowerId: Readonly<Record<string, TowerContribution>>;
}

export const referenceStrategies = {
  "blade-and-magic": {
    id: "blade-and-magic",
    towerPattern: [
      "fork-knight",
      "discount-wizard",
      "fork-knight",
      "discount-wizard",
    ],
  },
  "blade-and-song": {
    id: "blade-and-song",
    towerPattern: ["fork-knight", "fork-knight", "fork-knight", "bardbarian"],
  },
  "fork-brigade": {
    id: "fork-brigade",
    towerPattern: ["fork-knight"],
  },
  "budget-party": {
    id: "budget-party",
    towerPattern: [
      "fork-knight",
      "fork-knight",
      "fork-knight",
      "fork-knight",
      "discount-wizard",
      "bardbarian",
    ],
  },
  "five-tower-party": {
    id: "five-tower-party",
    towerPattern: [
      "fork-knight",
      "fork-knight",
      "discount-wizard",
      "bardbarian",
    ],
    maxTowers: 5,
  },
  "royal-accounting": {
    id: "royal-accounting",
    towerPattern: ["fork-knight", "discount-wizard", "bardbarian"],
    maxTowers: 5,
    spendingLimit: 620,
  },
} as const satisfies Record<string, ReferenceStrategy>;

export const referencePlanningModel = {
  briefingSeconds: 33,
  wavePreviewSeconds: 12,
  actionSeconds: 2.5,
} as const;

function roundedMinutes(ticks: number): number {
  return Number((ticks / TICK_RATE / 60).toFixed(2));
}

export function runReferenceStrategy(
  levelId: ActOneLevelId,
  strategy: ReferenceStrategy,
  modifierIds: readonly string[] = [],
): MissionBalanceReport {
  const level = levelDefinitions[levelId];
  if (!level) {
    throw new Error(`Unknown Act I level: ${levelId}`);
  }
  const unlockedRewardIds = ["troll-tollway", "castle-hassle"].includes(levelId)
    ? ["fork-table-service"]
    : [];
  const simulation = createSimulation({
    levelId,
    seed: 123,
    modifierIds,
    unlockedRewardIds,
  });
  const waveStartedAt = new Map<number, number>();
  const waves: WaveBalanceReport[] = [];
  const contribution: Record<string, TowerContribution> = {};
  const buildActions: BuildActionReport[] = [];
  let planningActions = 0;
  let peakEnemies = 0;
  let wavePeakEnemies = 0;
  let safety = 0;

  const recordEvents = (events: readonly GameEvent[]) => {
    for (const event of events) {
      if (event.type !== "tower-attacked") {
        continue;
      }
      const current = contribution[event.towerId] ?? {
        attacks: 0,
        targetHits: 0,
        damageDealt: 0,
        defeatedEnemies: 0,
      };
      contribution[event.towerId] = {
        attacks: current.attacks + 1,
        targetHits: current.targetHits + event.affectedInstanceIds.length,
        damageDealt: current.damageDealt + event.damageDealt,
        defeatedEnemies: current.defeatedEnemies + event.defeatedCount,
      };
    }
  };

  while (
    simulation.state.phase !== "victory" &&
    simulation.state.phase !== "defeat" &&
    safety < 1_000_000
  ) {
    safety += 1;
    if (simulation.state.phase === "preparing") {
      const towerLimit = strategy.maxTowers ?? level.pads.length;
      for (let padIndex = 0; padIndex < level.pads.length; padIndex += 1) {
        const pad = level.pads[padIndex];
        if (
          !pad ||
          simulation.state.towers.length >= towerLimit ||
          simulation.state.towers.some((tower) => tower.padId === pad.id)
        ) {
          continue;
        }
        const candidates = strategy.towerPattern
          .slice(padIndex % strategy.towerPattern.length)
          .concat(
            strategy.towerPattern.slice(
              0,
              padIndex % strategy.towerPattern.length,
            ),
          );
        const towerId = candidates.find(
          (candidate) =>
            !pad.allowedTowerIds || pad.allowedTowerIds.includes(candidate),
        );
        if (
          towerId &&
          towerDefinitions[towerId].cost <= simulation.state.gold &&
          simulation.state.metrics.spentGold + towerDefinitions[towerId].cost <=
            (strategy.spendingLimit ?? Number.POSITIVE_INFINITY)
        ) {
          const cost = towerDefinitions[towerId].cost;
          recordEvents(
            simulation.dispatch({
              type: "place-tower",
              towerId,
              padId: pad.id,
            }).events,
          );
          buildActions.push({
            beforeWave: simulation.state.waveIndex + 1,
            action: "place",
            towerId,
            padId: pad.id,
            resultingLevel: 1,
            cost,
          });
          planningActions += 1;
        }
      }

      let upgraded = true;
      while (upgraded) {
        upgraded = false;
        for (const tower of [...simulation.state.towers]) {
          const towerId = tower.towerId as TowerId;
          const definition = towerDefinitions[towerId];
          const upgradeCost =
            definition.levels[tower.level - 1]?.upgradeCost ?? null;
          if (
            upgradeCost !== null &&
            tower.level < simulation.getTowerMaxLevel(towerId) &&
            upgradeCost <= simulation.state.gold &&
            simulation.state.metrics.spentGold + upgradeCost <=
              (strategy.spendingLimit ?? Number.POSITIVE_INFINITY)
          ) {
            const cost = upgradeCost;
            recordEvents(
              simulation.dispatch({
                type: "upgrade-tower",
                instanceId: tower.id,
              }).events,
            );
            buildActions.push({
              beforeWave: simulation.state.waveIndex + 1,
              action: "upgrade",
              towerId,
              padId: tower.padId,
              resultingLevel: tower.level + 1,
              cost,
            });
            planningActions += 1;
            upgraded = true;
          }
        }
      }

      const waveIndex = simulation.state.waveIndex;
      recordEvents(simulation.dispatch({ type: "start-wave" }).events);
      waveStartedAt.set(waveIndex, simulation.state.tick);
      planningActions += 1;
    } else {
      if (
        simulation.state.abilityChargeTicks >= ROYAL_FORKFALL_CHARGE_TICKS &&
        simulation.state.enemies.length > 0
      ) {
        recordEvents(
          simulation.dispatch({
            type: "activate-ability",
            abilityId: "royal-forkfall",
          }).events,
        );
      }
      const result = simulation.step(10);
      recordEvents(result.events);
      peakEnemies = Math.max(peakEnemies, result.state.enemies.length);
      wavePeakEnemies = Math.max(wavePeakEnemies, result.state.enemies.length);
      for (const event of result.events) {
        if (event.type !== "wave-complete") {
          continue;
        }
        const startedAt = waveStartedAt.get(event.waveIndex);
        if (startedAt === undefined) {
          throw new Error(`Missing start tick for wave ${event.waveIndex + 1}`);
        }
        const ticks = result.state.tick - startedAt;
        waves.push({
          wave: event.waveIndex + 1,
          ticks,
          seconds: Number((ticks / TICK_RATE).toFixed(1)),
          livesAfter: result.state.lives,
          goldAfter: result.state.gold,
          peakEnemies: wavePeakEnemies,
        });
        wavePeakEnemies = 0;
      }
    }
  }

  if (safety >= 1_000_000) {
    throw new Error(`Reference strategy exceeded safety limit for ${levelId}`);
  }

  const activeTicks = waves.reduce((total, wave) => total + wave.ticks, 0);
  const planningSeconds =
    referencePlanningModel.briefingSeconds +
    level.waves.length * referencePlanningModel.wavePreviewSeconds +
    Math.max(0, planningActions - 1) * referencePlanningModel.actionSeconds;
  return {
    levelId,
    strategyId: strategy.id,
    result: simulation.state.phase === "victory" ? "victory" : "defeat",
    activeTicks,
    activeMinutes: roundedMinutes(activeTicks),
    planningActions,
    planningMinutes: Number((planningSeconds / 60).toFixed(2)),
    representativeMinutes: Number(
      (activeTicks / TICK_RATE / 60 + planningSeconds / 60).toFixed(2),
    ),
    lives: simulation.state.lives,
    gold: simulation.state.gold,
    leakedByEnemyId: simulation.state.metrics.leakedByEnemyId,
    towers: simulation.state.towers.length,
    peakEnemies,
    completedMasteryIds: simulation.state.completedMasteryIds,
    buildActions,
    waves,
    contributionByTowerId: contribution,
  };
}
