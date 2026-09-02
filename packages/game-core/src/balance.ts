import {
  campaignNodes,
  levelDefinitions,
  towerDefinitions,
} from "./content.js";
import { createSimulation } from "./simulation.js";
import { createEmptyLoadouts } from "./equipment.js";
import { ROYAL_FORKFALL_CHARGE_TICKS, TICK_RATE } from "./types.js";
import type { GameEvent } from "./types.js";
import type { EquipmentContribution, LoadoutSnapshot } from "@srtg/protocol";

type TowerId = keyof typeof towerDefinitions;
/** Any campaign level id currently defined in content, across all acts. */
export type CampaignLevelId = keyof typeof levelDefinitions;
/** @deprecated retained for existing imports; equivalent to `CampaignLevelId`. */
export type ActOneLevelId = CampaignLevelId;

/**
 * Reward ids granted by every campaign node strictly before `levelId` in
 * authored order, mirroring real campaign progression (a fresh save that
 * has beaten every earlier mission once). Generic over the full campaign
 * node list rather than any hardcoded level id.
 */
function unlockedRewardIdsUpTo(levelId: string): readonly string[] {
  const node = campaignNodes.find((candidate) => candidate.levelId === levelId);
  if (!node) {
    return [];
  }
  return campaignNodes
    .filter((candidate) => candidate.levelId && candidate.order < node.order)
    .flatMap((candidate) => candidate.rewardIds);
}

export interface ReferenceStrategy {
  readonly id: string;
  readonly towerPattern: readonly TowerId[];
  readonly maxTowers?: number;
  readonly spendingLimit?: number;
  /** Optional authored placement order for lane-specific regression builds. */
  readonly preferredPadIds?: readonly string[];
  /** Optional combat-only opening setup used for fixed-build stress tests. */
  readonly initialPlacements?: readonly {
    readonly towerId: TowerId;
    readonly padId: string;
    readonly level: number;
  }[];
  readonly vacateBeforeWaves?: readonly {
    readonly waveIndex: number;
    readonly padIds: readonly string[];
  }[];
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
  readonly equipmentScenarioId: string;
  readonly result: "victory" | "defeat";
  readonly activeTicks: number;
  readonly activeMinutes: number;
  readonly planningActions: number;
  readonly planningMinutes: number;
  readonly representativeMinutes: number;
  readonly lives: number;
  readonly gold: number;
  readonly leakedByEnemyId: Readonly<Record<string, number>>;
  readonly splitSpawns: number;
  readonly spentGold: number;
  readonly authoredSpentGold: number;
  readonly leaksDuringEnvironmentHazards: number;
  readonly exposedPadUses: number;
  readonly referredEnemiesReachedHalfway: number;
  readonly bossReinforcementCalls: Readonly<Record<string, number>>;
  readonly towers: number;
  readonly peakEnemies: number;
  readonly completedMasteryIds: readonly string[];
  readonly buildActions: readonly BuildActionReport[];
  readonly waves: readonly WaveBalanceReport[];
  readonly contributionByTowerId: Readonly<Record<string, TowerContribution>>;
  readonly rankDistribution: Readonly<Record<string, number>>;
  readonly equipmentContribution: Readonly<
    Record<string, EquipmentContribution>
  >;
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
  "two-knight-table-service": {
    id: "two-knight-table-service",
    towerPattern: ["fork-knight"],
    maxTowers: 2,
    initialPlacements: [
      { towerId: "fork-knight", padId: "frost-perch", level: 4 },
      { towerId: "fork-knight", padId: "floe-crossing", level: 4 },
    ],
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
  "claims-control": {
    id: "claims-control",
    towerPattern: ["fork-knight", "discount-wizard"],
    vacateBeforeWaves: [
      {
        waveIndex: 5,
        padIds: [
          "siege-ladder-west",
          "west-parapet",
          "siege-ladder-east",
          "east-parapet",
          "east-rampart",
          "keep-drawbridge",
          "keep-barbican",
          "keep-standing-stone",
        ],
      },
    ],
  },
  "volcanic-detour": {
    id: "volcanic-detour",
    towerPattern: ["fork-knight", "discount-wizard", "bardbarian"],
    vacateBeforeWaves: [
      { waveIndex: 2, padIds: ["west-inside", "west-outside"] },
      { waveIndex: 4, padIds: ["center-inside", "center-outside"] },
      { waveIndex: 6, padIds: ["east-inside", "east-outside"] },
      { waveIndex: 7, padIds: ["center-inside", "center-outside"] },
    ],
  },
  "six-degree-defense": {
    id: "six-degree-defense",
    towerPattern: ["fork-knight", "discount-wizard", "bardbarian"],
    maxTowers: 6,
  },
  "executive-budget": {
    id: "executive-budget",
    towerPattern: ["fork-knight", "discount-wizard", "bardbarian"],
    maxTowers: 7,
    spendingLimit: 1_650,
  },
} as const satisfies Record<string, ReferenceStrategy>;

export const representativeStrategyIdsByLevel = {
  "muddy-moat": ["blade-and-magic", "blade-and-song"],
  "mimic-market": ["blade-and-magic", "blade-and-song"],
  "troll-tollway": ["blade-and-magic", "blade-and-song"],
  "castle-hassle": ["blade-and-magic", "blade-and-song"],
  "frozen-assets": ["blade-and-magic", "five-tower-party"],
  "department-of-unnecessary-bridges": ["blade-and-magic", "blade-and-song"],
  "siege-and-desist": ["blade-and-magic", "blade-and-song"],
  "lava-lamp-district": ["blade-and-magic", "blade-and-song"],
  "necromancers-networking-event": ["blade-and-magic", "blade-and-song"],
  "quarterly-dragon-review": ["blade-and-magic", "blade-and-song"],
} as const satisfies Record<
  CampaignLevelId,
  readonly [keyof typeof referenceStrategies, keyof typeof referenceStrategies]
>;

export const referencePlanningModel = {
  briefingSeconds: 33,
  wavePreviewSeconds: 12,
  actionSeconds: 2.5,
} as const;

export const equipmentBalanceScenarios = {
  "no-gear": {
    id: "no-gear",
    loadoutSnapshot: createEmptyLoadouts(),
  },
  "representative-common": {
    id: "representative-common",
    loadoutSnapshot: {
      "fork-knight": {
        weapon: null,
        armor: "cardboard-cuirass-deluxe-ish",
        charm: null,
      },
      "discount-wizard": { weapon: null, armor: null, charm: null },
      bardbarian: { weapon: null, armor: null, charm: null },
    },
  },
  "representative-s-plus-plus-plus": {
    id: "representative-s-plus-plus-plus",
    loadoutSnapshot: {
      "fork-knight": { weapon: "excalifork", armor: null, charm: null },
      "discount-wizard": {
        weapon: "wand-of-ooze-and-aahs",
        armor: null,
        charm: null,
      },
      bardbarian: {
        weapon: null,
        armor: null,
        charm: "the-forbidden-power-chord",
      },
    },
  },
  "strongest-legal-s-plus-plus-plus": {
    id: "strongest-legal-s-plus-plus-plus",
    loadoutSnapshot: {
      "fork-knight": {
        weapon: "excalifork",
        armor: null,
        charm: "plot-armor-pin",
      },
      "discount-wizard": {
        weapon: "wand-of-ooze-and-aahs",
        armor: null,
        charm: null,
      },
      bardbarian: {
        weapon: null,
        armor: null,
        charm: "the-forbidden-power-chord",
      },
    },
  },
} as const satisfies Record<
  string,
  { readonly id: string; readonly loadoutSnapshot: LoadoutSnapshot }
>;

function roundedMinutes(ticks: number): number {
  return Number((ticks / TICK_RATE / 60).toFixed(2));
}

export function runReferenceStrategy(
  levelId: CampaignLevelId,
  strategy: ReferenceStrategy,
  modifierIds: readonly string[] = [],
  equipmentScenario: {
    readonly id: string;
    readonly loadoutSnapshot: LoadoutSnapshot;
  } = equipmentBalanceScenarios["no-gear"],
): MissionBalanceReport {
  const level = levelDefinitions[levelId];
  if (!level) {
    throw new Error(`Unknown campaign level: ${levelId}`);
  }
  const unlockedRewardIds = unlockedRewardIdsUpTo(levelId);
  const simulation = createSimulation(
    strategy.initialPlacements
      ? {
          checkpoint: {
            levelId,
            seed: 123,
            modifierIds: [...modifierIds],
            tick: 0,
            nextWave: 0,
            lives: level.startingLives,
            gold: 0,
            score: 0,
            spawnedEnemies: 0,
            placements: strategy.initialPlacements.map((placement, index) => ({
              id: `tower-${index + 1}`,
              ...placement,
            })),
            metrics: {
              spentGold: 0,
              leakedEnemies: 0,
              soldTowers: 0,
              usedTowerIds: Array.from(
                new Set(
                  strategy.initialPlacements.map(
                    (placement) => placement.towerId,
                  ),
                ),
              ),
              maxTowersPlaced: strategy.initialPlacements.length,
            },
          },
          unlockedRewardIds,
          loadoutSnapshot: equipmentScenario.loadoutSnapshot,
        }
      : {
          levelId,
          seed: 123,
          modifierIds,
          unlockedRewardIds,
          loadoutSnapshot: equipmentScenario.loadoutSnapshot,
        },
  );
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
      const vacatedPadIds = new Set(
        strategy.vacateBeforeWaves
          ?.filter(
            (schedule) => schedule.waveIndex === simulation.state.waveIndex,
          )
          .flatMap((schedule) => schedule.padIds) ?? [],
      );
      for (const tower of [...simulation.state.towers]) {
        if (!vacatedPadIds.has(tower.padId)) {
          continue;
        }
        recordEvents(
          simulation.dispatch({
            type: "sell-tower",
            instanceId: tower.id,
          }).events,
        );
        planningActions += 1;
      }
      const towerLimit = strategy.maxTowers ?? level.pads.length;
      const orderedPads = strategy.preferredPadIds
        ? [
            ...strategy.preferredPadIds
              .map((padId) => level.pads.find((pad) => pad.id === padId))
              .filter((pad): pad is (typeof level.pads)[number] =>
                Boolean(pad),
              ),
            ...level.pads.filter(
              (pad) => !strategy.preferredPadIds?.includes(pad.id),
            ),
          ]
        : level.pads;
      for (let padIndex = 0; padIndex < orderedPads.length; padIndex += 1) {
        const pad = orderedPads[padIndex];
        if (
          !pad ||
          vacatedPadIds.has(pad.id) ||
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
            (!pad.allowedTowerIds || pad.allowedTowerIds.includes(candidate)) &&
            !pad.deniedTowerIds?.includes(candidate),
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
    equipmentScenarioId: equipmentScenario.id,
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
    splitSpawns: simulation.state.metrics.splitSpawns,
    spentGold: simulation.state.metrics.spentGold,
    authoredSpentGold: simulation.state.metrics.authoredSpentGold,
    leaksDuringEnvironmentHazards:
      simulation.state.metrics.leaksDuringEnvironmentHazards,
    exposedPadUses: simulation.state.metrics.exposedPadUses,
    referredEnemiesReachedHalfway:
      simulation.state.metrics.referredEnemiesReachedHalfway,
    bossReinforcementCalls: simulation.state.metrics.bossReinforcementCalls,
    towers: simulation.state.towers.length,
    peakEnemies,
    completedMasteryIds: simulation.state.completedMasteryIds,
    buildActions,
    waves,
    contributionByTowerId: contribution,
    rankDistribution: simulation.state.towers.reduce<Record<string, number>>(
      (counts, tower) => {
        const key = `${tower.towerId}:rank-${tower.level}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    ),
    equipmentContribution: simulation.state.metrics.equipment,
  };
}

export function runEquipmentBalanceMatrix(): readonly MissionBalanceReport[] {
  return Object.keys(levelDefinitions).flatMap((levelId) =>
    Object.values(equipmentBalanceScenarios).flatMap((scenario) =>
      representativeStrategyIdsByLevel[levelId as CampaignLevelId].map(
        (strategyId) =>
          runReferenceStrategy(
            levelId as CampaignLevelId,
            referenceStrategies[strategyId],
            [],
            scenario,
          ),
      ),
    ),
  );
}

export function runMonoForkStress(
  levelId: CampaignLevelId,
  loadoutSnapshot: LoadoutSnapshot = createEmptyLoadouts(),
): MissionBalanceReport {
  const level = levelDefinitions[levelId];
  const legalPads = level.pads
    .filter(
      (pad) =>
        (!pad.allowedTowerIds || pad.allowedTowerIds.includes("fork-knight")) &&
        !pad.deniedTowerIds?.includes("fork-knight"),
    )
    .slice(0, 2);
  return runReferenceStrategy(
    levelId,
    {
      id: "two-rank-iv-fork-stress",
      towerPattern: ["fork-knight"],
      maxTowers: 2,
      initialPlacements: legalPads.map((pad) => ({
        towerId: "fork-knight",
        padId: pad.id,
        level: 4,
      })),
    },
    [],
    { id: "mono-fork-stress", loadoutSnapshot },
  );
}
