import {
  CONTENT_VERSION,
  EMPTY_EQUIPMENT_PROC_STATE,
  EMPTY_LOADOUTS,
  type AbilityId,
  type BattleCheckpoint,
  type DefenderId,
  type EquipmentContribution,
  type EquipmentProcState,
  type GameCommand,
  type LoadoutSnapshot,
} from "@srtg/protocol";

import {
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  rewardDefinitions,
  towerDefinitions,
} from "./content.js";
import { evaluateMasteryRule, type MasteryContext } from "./mastery.js";
import { pointAlongPath, preparePath, type PreparedPath } from "./path.js";
import {
  applyEquipmentStats,
  equipmentForDefender,
  validateLoadoutSnapshot,
  type EquipmentEffect,
} from "./equipment.js";
import { deriveBattleRngStates, SeededRandom } from "./rng.js";
import {
  activeSlowPercent,
  applyEnemyStatus,
  EMPTY_ENEMY_STATUS,
  expireEnemyStatus,
} from "./status.js";
import {
  EMERGENCY_TEA_BREAK_SLOW_TICKS,
  ROYAL_FORKFALL_CHARGE_TICKS,
  ROYAL_FORKFALL_DAMAGE,
  TICK_MS,
  type BossEscortDefinition,
  type BossPhaseDefinition,
  type EnemyDefinition,
  type EnemyState,
  type GameEvent,
  type GameState,
  type Point,
  type Simulation,
  type SimulationOptions,
  type StepResult,
  type TowerDefinition,
  type TowerLevelDefinition,
  type TowerPadDefinition,
  type TowerState,
} from "./types.js";
import { validateCheckpointContent } from "./validation.js";

interface MutableMetrics {
  spentGold: number;
  authoredSpentGold: number;
  leakedEnemies: number;
  leakedByEnemyId: Record<string, number>;
  leakedByWaveIndex: Record<string, number>;
  soldTowers: number;
  usedTowerIds: string[];
  maxTowersPlaced: number;
  bossDefeatPathPercent: number | null;
  splitSpawns: number;
  abilityActivations: Record<string, number>;
  lastEnemyClearedTick: Record<string, number>;
  leaksDuringEnvironmentHazards: number;
  exposedPadUses: number;
  referredEnemiesReachedHalfway: number;
  referredWaveIndices: number[];
  bossReinforcementCalls: Record<string, number>;
  defeatedBossEnemyIds: string[];
  equipment: Record<string, EquipmentContribution>;
}

interface MutableState {
  levelId: string;
  attemptId: string;
  seed: number;
  modifierIds: string[];
  loadoutSnapshot: LoadoutSnapshot;
  rngState: { spawn: number; combat: number };
  equipmentProcState: EquipmentProcState;
  tick: number;
  phase: GameState["phase"];
  waveIndex: number;
  waveStartedAtTick: number | null;
  nextSpawnIndex: number;
  lives: number;
  gold: number;
  score: number;
  abilityChargeTicks: number;
  teaBreakUsedThisWave: boolean;
  towers: TowerState[];
  enemies: EnemyState[];
  metrics: MutableMetrics;
  completedMasteryIds: string[];
  telegraphedEnvironmentHazardIds: string[];
  activeEnvironmentHazardIds: string[];
  exposedPadIds: string[];
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}

function squaredDistance(left: Point, right: Point): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}

const towerInstanceOrdinalCache = new Map<string, number>();

function towerInstanceOrdinal(instanceId: string): number | undefined {
  const cached = towerInstanceOrdinalCache.get(instanceId);
  if (cached !== undefined) {
    return cached;
  }
  if (!instanceId.startsWith("tower-")) {
    return undefined;
  }
  const ordinal = Number(instanceId.slice(6));
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    return undefined;
  }
  towerInstanceOrdinalCache.set(instanceId, ordinal);
  return ordinal;
}

export function compareTowerInstanceIds(left: string, right: string): number {
  const leftOrdinal = towerInstanceOrdinal(left);
  const rightOrdinal = towerInstanceOrdinal(right);
  if (
    leftOrdinal !== undefined &&
    rightOrdinal !== undefined &&
    leftOrdinal !== rightOrdinal
  ) {
    return leftOrdinal - rightOrdinal;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The content maps use `as const satisfies Record<string, X>` so individual
 * definitions keep their literal types (useful for tests). That means a
 * generic string-keyed lookup returns the narrow per-key literal type rather
 * than the shared `X` shape, which breaks access to optional fields that
 * only some definitions declare (e.g. `traits`, `bossPhase`, `pierceCount`).
 * These helpers normalize lookups back to the shared definition type.
 */
function enemyDefinition(enemyId: string): EnemyDefinition {
  const definition = enemyDefinitions[enemyId as keyof typeof enemyDefinitions];
  if (!definition) {
    throw new Error(`Unknown enemy: ${enemyId}`);
  }
  return definition;
}

function towerDefinition(towerId: string): TowerDefinition {
  const definition = towerDefinitions[towerId as keyof typeof towerDefinitions];
  if (!definition) {
    throw new Error(`Unknown tower: ${towerId}`);
  }
  return definition;
}

function deepState(state: MutableState): GameState {
  return {
    ...state,
    modifierIds: [...state.modifierIds],
    loadoutSnapshot: cloneLoadouts(state.loadoutSnapshot),
    rngState: { ...state.rngState },
    equipmentProcState: cloneProcState(state.equipmentProcState),
    towers: state.towers.map((tower) => ({ ...tower })),
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    metrics: {
      ...state.metrics,
      usedTowerIds: [...state.metrics.usedTowerIds],
      leakedByEnemyId: { ...state.metrics.leakedByEnemyId },
      leakedByWaveIndex: { ...state.metrics.leakedByWaveIndex },
      abilityActivations: { ...state.metrics.abilityActivations },
      lastEnemyClearedTick: { ...state.metrics.lastEnemyClearedTick },
      referredWaveIndices: [...state.metrics.referredWaveIndices],
      bossReinforcementCalls: { ...state.metrics.bossReinforcementCalls },
      defeatedBossEnemyIds: [...state.metrics.defeatedBossEnemyIds],
      equipment: Object.fromEntries(
        Object.entries(state.metrics.equipment).map(
          ([itemId, contribution]) => [itemId, { ...contribution }],
        ),
      ),
    },
    completedMasteryIds: [...state.completedMasteryIds],
    telegraphedEnvironmentHazardIds: [...state.telegraphedEnvironmentHazardIds],
    activeEnvironmentHazardIds: [...state.activeEnvironmentHazardIds],
    exposedPadIds: [...state.exposedPadIds],
  };
}

function cloneLoadouts(loadouts: LoadoutSnapshot): LoadoutSnapshot {
  return {
    "fork-knight": { ...loadouts["fork-knight"] },
    "discount-wizard": { ...loadouts["discount-wizard"] },
    bardbarian: { ...loadouts.bardbarian },
  };
}

function cloneProcState(state: EquipmentProcState): EquipmentProcState {
  return {
    counters: { ...state.counters },
    cooldownUntilTicks: { ...state.cooldownUntilTicks },
    oncePerWaveIds: [...state.oncePerWaveIds],
    oncePerBattleIds: [...state.oncePerBattleIds],
    teamCooldownUntilTicks: { ...state.teamCooldownUntilTicks },
    targetCaps: { ...state.targetCaps },
    activeBuffUntilTicks: { ...state.activeBuffUntilTicks },
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

class GameSimulation implements Simulation {
  private readonly level;
  private readonly routePaths: ReadonlyMap<string, PreparedPath>;
  private readonly defaultRouteId: string;
  private readonly spawnRandom: SeededRandom;
  private readonly combatRandom: SeededRandom;
  private readonly unlockedRewardIds: ReadonlySet<string>;
  private mutableState: MutableState;
  private enemyCounter = 0;
  private towerCounter = 0;

  public constructor(options: SimulationOptions = {}) {
    const levelId =
      options.checkpoint?.levelId ?? options.levelId ?? "muddy-moat";
    const level = Object.hasOwn(levelDefinitions, levelId)
      ? levelDefinitions[levelId as keyof typeof levelDefinitions]
      : undefined;
    if (!level) {
      throw new Error(`Unknown level: ${levelId}`);
    }

    const seed = options.checkpoint?.seed ?? options.seed ?? 73_041;
    if (!Number.isInteger(seed) || seed < 1 || seed > 2_147_483_647) {
      throw new Error("Seed must be a positive 32-bit integer");
    }
    if (
      options.goldFloor !== undefined &&
      (!Number.isSafeInteger(options.goldFloor) ||
        options.goldFloor < 0 ||
        options.goldFloor > 999_999)
    ) {
      throw new Error("Gold floor must be an integer from 0 through 999999");
    }

    const modifierIds = [
      ...(options.checkpoint?.modifierIds ?? options.modifierIds ?? []),
    ];
    for (const modifierId of modifierIds) {
      if (!Object.hasOwn(modifierDefinitions, modifierId)) {
        throw new Error(`Unknown modifier: ${modifierId}`);
      }
      if (!level.availableModifierIds.includes(modifierId)) {
        throw new Error(
          `Modifier ${modifierId} is not available for ${levelId}`,
        );
      }
    }

    this.level = level;
    const routeDefs = level.routes ?? [{ id: "main", path: level.path }];
    this.routePaths = new Map(
      routeDefs.map((route) => [route.id, preparePath(route.path)]),
    );
    this.defaultRouteId = routeDefs[0]!.id;
    const derivedRng = deriveBattleRngStates(seed);
    const rngState = options.checkpoint?.rngState ?? derivedRng;
    this.spawnRandom = new SeededRandom(rngState.spawn);
    this.combatRandom = new SeededRandom(rngState.combat);
    this.unlockedRewardIds = new Set(options.unlockedRewardIds ?? []);
    if (options.checkpoint) {
      const checkpointErrors = validateCheckpointContent(options.checkpoint);
      if (checkpointErrors.length > 0) {
        throw new Error(checkpointErrors[0]);
      }
      if (!options.checkpoint.rngState) {
        for (
          let spawned = 0;
          spawned < options.checkpoint.spawnedEnemies;
          spawned += 1
        ) {
          this.spawnRandom.nextUint32();
        }
      }
    }

    const goldDelta = modifierIds.reduce(
      (total, id) =>
        total +
        modifierDefinitions[id as keyof typeof modifierDefinitions]
          .startingGoldDelta,
      0,
    );
    const checkpoint = options.checkpoint;
    const authoredGold =
      checkpoint?.gold ?? Math.max(0, level.startingGold + goldDelta);
    const gold =
      options.goldFloor === undefined
        ? authoredGold
        : Math.max(authoredGold, options.goldFloor);
    const loadoutSnapshot = cloneLoadouts(
      checkpoint?.loadoutSnapshot ??
        options.loadoutSnapshot ??
        (EMPTY_LOADOUTS as LoadoutSnapshot),
    );
    const loadoutErrors = validateLoadoutSnapshot(loadoutSnapshot);
    if (loadoutErrors.length > 0) {
      throw new Error(loadoutErrors[0]);
    }
    const attemptId =
      checkpoint?.attemptId ??
      options.attemptId ??
      `battle:${levelId}:${seed}:${modifierIds.sort().join(".") || "normal"}`;
    const equipmentProcState = cloneProcState(
      checkpoint?.equipmentProcState ??
        ({
          ...EMPTY_EQUIPMENT_PROC_STATE,
          oncePerWaveIds: [],
          oncePerBattleIds: [],
        } satisfies EquipmentProcState),
    );

    const towers: TowerState[] =
      checkpoint?.placements.map((placement) => {
        const effectiveMax = this.effectiveMaxLevel(placement.towerId);
        if (placement.level > effectiveMax) {
          throw new Error(
            `Tower ${placement.towerId} level ${placement.level} exceeds the unlocked maximum of ${effectiveMax}`,
          );
        }
        return {
          id: placement.id,
          towerId: placement.towerId,
          padId: placement.padId,
          level: placement.level,
          nextAttackTick: checkpoint.tick,
          investedGold:
            placement.investedGold ??
            this.investedGold(placement.towerId, placement.level),
        };
      }) ?? [];

    this.mutableState = {
      levelId,
      attemptId,
      seed,
      modifierIds,
      loadoutSnapshot,
      rngState: {
        spawn: this.spawnRandom.state,
        combat: this.combatRandom.state,
      },
      equipmentProcState,
      tick: checkpoint?.tick ?? 0,
      phase: "preparing",
      waveIndex: checkpoint?.nextWave ?? 0,
      waveStartedAtTick: null,
      nextSpawnIndex: 0,
      lives: checkpoint?.lives ?? level.startingLives,
      gold,
      score: checkpoint?.score ?? 0,
      abilityChargeTicks: Math.min(
        checkpoint?.abilityChargeTicks ?? 0,
        ROYAL_FORKFALL_CHARGE_TICKS,
      ),
      teaBreakUsedThisWave: checkpoint?.teaBreakUsedThisWave ?? false,
      towers,
      enemies: [],
      metrics: checkpoint
        ? {
            spentGold: checkpoint.metrics.spentGold,
            authoredSpentGold:
              checkpoint.metrics.authoredSpentGold ??
              checkpoint.metrics.spentGold,
            leakedEnemies: checkpoint.metrics.leakedEnemies,
            leakedByEnemyId: { ...(checkpoint.metrics.leakedByEnemyId ?? {}) },
            leakedByWaveIndex: {
              ...(checkpoint.metrics.leakedByWaveIndex ?? {}),
            },
            soldTowers: checkpoint.metrics.soldTowers,
            usedTowerIds: [...checkpoint.metrics.usedTowerIds],
            maxTowersPlaced: Math.max(
              checkpoint.metrics.maxTowersPlaced ?? 0,
              towers.length,
            ),
            bossDefeatPathPercent:
              checkpoint.metrics.bossDefeatPathPercent ?? null,
            splitSpawns: checkpoint.metrics.splitSpawns ?? 0,
            abilityActivations: {
              ...(checkpoint.metrics.abilityActivations ?? {}),
            },
            lastEnemyClearedTick: {
              ...(checkpoint.metrics.lastEnemyClearedTick ?? {}),
            },
            leaksDuringEnvironmentHazards:
              checkpoint.metrics.leaksDuringEnvironmentHazards ?? 0,
            exposedPadUses: checkpoint.metrics.exposedPadUses ?? 0,
            referredEnemiesReachedHalfway:
              checkpoint.metrics.referredEnemiesReachedHalfway ?? 0,
            referredWaveIndices: [
              ...(checkpoint.metrics.referredWaveIndices ?? []),
            ],
            bossReinforcementCalls: {
              ...(checkpoint.metrics.bossReinforcementCalls ?? {}),
            },
            defeatedBossEnemyIds: [
              ...(checkpoint.metrics.defeatedBossEnemyIds ?? []),
            ],
            equipment: Object.fromEntries(
              Object.entries(checkpoint.metrics.equipment ?? {}).map(
                ([itemId, contribution]) => [itemId, { ...contribution }],
              ),
            ),
          }
        : {
            spentGold: 0,
            authoredSpentGold: 0,
            leakedEnemies: 0,
            leakedByEnemyId: {},
            leakedByWaveIndex: {},
            soldTowers: 0,
            usedTowerIds: [],
            maxTowersPlaced: towers.length,
            bossDefeatPathPercent: null,
            splitSpawns: 0,
            abilityActivations: {},
            lastEnemyClearedTick: {},
            leaksDuringEnvironmentHazards: 0,
            exposedPadUses: 0,
            referredEnemiesReachedHalfway: 0,
            referredWaveIndices: [],
            bossReinforcementCalls: {},
            defeatedBossEnemyIds: [],
            equipment: {},
          },
      completedMasteryIds: [],
      telegraphedEnvironmentHazardIds: [],
      activeEnvironmentHazardIds: [],
      exposedPadIds: [],
    };

    this.towerCounter = this.mutableState.towers.reduce((maximum, tower) => {
      const parsed = Number.parseInt(tower.id.replace("tower-", ""), 10);
      return Number.isFinite(parsed) ? Math.max(maximum, parsed) : maximum;
    }, 0);
    this.enemyCounter = checkpoint?.spawnedEnemies ?? 0;
  }

  public get state(): GameState {
    this.mutableState.rngState = {
      spawn: this.spawnRandom.state,
      combat: this.combatRandom.state,
    };
    return deepState(this.mutableState);
  }

  public dispatch(command: GameCommand): StepResult {
    const events: GameEvent[] = [];

    switch (command.type) {
      case "place-tower":
        this.placeTower(command.towerId, command.padId);
        break;
      case "upgrade-tower":
        this.upgradeTower(command.instanceId);
        break;
      case "sell-tower":
        this.sellTower(command.instanceId);
        break;
      case "start-wave":
        this.startWave();
        break;
      case "activate-ability":
        this.activateAbility(command.abilityId ?? "royal-forkfall", events);
        break;
      default:
        assertNever(command);
    }

    return { state: this.state, events };
  }

  public step(ticks = 1): StepResult {
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > 10_000) {
      throw new RangeError("ticks must be an integer between 1 and 10000");
    }

    const events: GameEvent[] = [];
    for (
      let iteration = 0;
      iteration < ticks && this.mutableState.phase === "active";
      iteration += 1
    ) {
      this.tick(events);
    }

    return { state: this.state, events };
  }

  public getEnemyPosition(enemy: EnemyState): Point {
    const preparedPath =
      this.routePaths.get(enemy.routeId) ??
      this.routePaths.get(this.defaultRouteId)!;
    return pointAlongPath(preparedPath, enemy.pathDistanceMilli);
  }

  private compareEnemyProgress(left: EnemyState, right: EnemyState): number {
    const leftPath =
      this.routePaths.get(left.routeId) ??
      this.routePaths.get(this.defaultRouteId)!;
    const rightPath =
      this.routePaths.get(right.routeId) ??
      this.routePaths.get(this.defaultRouteId)!;
    const leftRemaining = leftPath.totalDistanceMilli - left.pathDistanceMilli;
    const rightRemaining =
      rightPath.totalDistanceMilli - right.pathDistanceMilli;
    return leftRemaining - rightRemaining || left.id.localeCompare(right.id);
  }

  public getTowerMaxLevel(towerId: string): number {
    if (!Object.hasOwn(towerDefinitions, towerId)) {
      throw new Error(`Unknown tower: ${towerId}`);
    }
    return this.effectiveMaxLevel(towerId);
  }

  public createCheckpoint(): BattleCheckpoint | null {
    const state = this.mutableState;
    if (
      state.phase !== "preparing" ||
      state.enemies.length > 0 ||
      state.waveIndex >= this.level.waves.length
    ) {
      return null;
    }

    return {
      levelId: state.levelId,
      attemptId: state.attemptId,
      seed: state.seed,
      modifierIds: [...state.modifierIds],
      loadoutSnapshot: cloneLoadouts(state.loadoutSnapshot),
      rngState: {
        spawn: this.spawnRandom.state,
        combat: this.combatRandom.state,
      },
      equipmentProcState: cloneProcState(state.equipmentProcState),
      tick: state.tick,
      nextWave: state.waveIndex,
      lives: state.lives,
      gold: state.gold,
      score: state.score,
      abilityChargeTicks: state.abilityChargeTicks,
      teaBreakUsedThisWave: state.teaBreakUsedThisWave,
      spawnedEnemies: this.enemyCounter,
      placements: state.towers.map((tower) => ({
        id: tower.id,
        towerId: tower.towerId,
        padId: tower.padId,
        level: tower.level,
        investedGold: tower.investedGold,
      })),
      metrics: {
        spentGold: state.metrics.spentGold,
        authoredSpentGold: state.metrics.authoredSpentGold,
        leakedEnemies: state.metrics.leakedEnemies,
        leakedByEnemyId: { ...state.metrics.leakedByEnemyId },
        leakedByWaveIndex: { ...state.metrics.leakedByWaveIndex },
        soldTowers: state.metrics.soldTowers,
        usedTowerIds: [...state.metrics.usedTowerIds],
        maxTowersPlaced: state.metrics.maxTowersPlaced,
        bossDefeatPathPercent: state.metrics.bossDefeatPathPercent,
        splitSpawns: state.metrics.splitSpawns,
        abilityActivations: { ...state.metrics.abilityActivations },
        lastEnemyClearedTick: { ...state.metrics.lastEnemyClearedTick },
        leaksDuringEnvironmentHazards:
          state.metrics.leaksDuringEnvironmentHazards,
        exposedPadUses: state.metrics.exposedPadUses,
        referredEnemiesReachedHalfway:
          state.metrics.referredEnemiesReachedHalfway,
        referredWaveIndices: [...state.metrics.referredWaveIndices],
        bossReinforcementCalls: {
          ...state.metrics.bossReinforcementCalls,
        },
        defeatedBossEnemyIds: [...state.metrics.defeatedBossEnemyIds],
        equipment: Object.fromEntries(
          Object.entries(state.metrics.equipment).map(
            ([itemId, contribution]) => [itemId, { ...contribution }],
          ),
        ),
      },
    };
  }

  public stateHash(): string {
    const state = this.mutableState;
    return fnv1a(
      JSON.stringify({
        levelId: state.levelId,
        attemptId: state.attemptId,
        seed: state.seed,
        modifierIds: state.modifierIds,
        loadoutSnapshot: state.loadoutSnapshot,
        rngState: {
          spawn: this.spawnRandom.state,
          combat: this.combatRandom.state,
        },
        equipmentProcState: state.equipmentProcState,
        unlockedRewardIds: [...this.unlockedRewardIds].sort(),
        tick: state.tick,
        phase: state.phase,
        waveIndex: state.waveIndex,
        lives: state.lives,
        gold: state.gold,
        score: state.score,
        abilityChargeTicks: state.abilityChargeTicks,
        teaBreakUsedThisWave: state.teaBreakUsedThisWave,
        towers: state.towers,
        enemies: state.enemies,
        metrics: state.metrics,
        completedMasteryIds: state.completedMasteryIds,
        telegraphedEnvironmentHazardIds: state.telegraphedEnvironmentHazardIds,
        activeEnvironmentHazardIds: state.activeEnvironmentHazardIds,
        exposedPadIds: state.exposedPadIds,
      }),
    );
  }

  private placeTower(towerId: string, padId: string): void {
    this.requireTowerManagement();
    const definition = Object.hasOwn(towerDefinitions, towerId)
      ? towerDefinitions[towerId as keyof typeof towerDefinitions]
      : undefined;
    if (!definition) {
      throw new Error(`Unknown tower: ${towerId}`);
    }
    const pad = this.level.pads.find((candidate) => candidate.id === padId);
    if (!pad) {
      throw new Error(`Unknown tower pad: ${padId}`);
    }
    if (pad.allowedTowerIds && !pad.allowedTowerIds.includes(towerId)) {
      throw new Error(`Tower ${towerId} cannot be placed on pad ${padId}`);
    }
    if (pad.deniedTowerIds?.includes(towerId)) {
      throw new Error(`Tower ${towerId} cannot be placed on pad ${padId}`);
    }
    if (this.isPadShutDown(pad)) {
      throw new Error(`Tower pad ${padId} is shut down`);
    }
    if (this.mutableState.towers.some((tower) => tower.padId === padId)) {
      throw new Error(`Tower pad ${padId} is occupied`);
    }
    const defenderId = towerId as DefenderId;
    const discountEntry = equipmentForDefender(
      this.mutableState.loadoutSnapshot,
      defenderId,
    )
      .flatMap((item) =>
        item.effects.map((effect) => ({ itemId: item.id, effect })),
      )
      .find(
        (
          entry,
        ): entry is {
          itemId: string;
          effect: Extract<EquipmentEffect, { kind: "placement-discount" }>;
        } =>
          entry.effect.kind === "placement-discount" &&
          (!entry.effect.firstOnly ||
            !this.mutableState.metrics.usedTowerIds.includes(towerId)),
      );
    const actualCost = Math.max(
      0,
      definition.cost - (discountEntry?.effect.amount ?? 0),
    );
    if (this.mutableState.gold < actualCost) {
      throw new Error("Not enough gold");
    }

    this.towerCounter += 1;
    this.mutableState.gold -= actualCost;
    this.mutableState.metrics.spentGold += actualCost;
    this.mutableState.metrics.authoredSpentGold += definition.cost;
    if (discountEntry) {
      this.recordEquipmentContribution(discountEntry.itemId, {
        goldSaved: discountEntry.effect.amount,
      });
    }
    if (!this.mutableState.metrics.usedTowerIds.includes(towerId)) {
      this.mutableState.metrics.usedTowerIds.push(towerId);
      this.mutableState.metrics.usedTowerIds.sort();
    }
    this.mutableState.towers.push({
      id: `tower-${this.towerCounter}`,
      towerId,
      padId,
      level: 1,
      nextAttackTick: 0,
      investedGold: actualCost,
    });
    this.mutableState.metrics.maxTowersPlaced += 1;
  }

  private upgradeTower(instanceId: string): void {
    this.requireTowerManagement();
    const index = this.mutableState.towers.findIndex(
      (tower) => tower.id === instanceId,
    );
    const tower = this.mutableState.towers[index];
    if (!tower) {
      throw new Error(`Unknown tower instance: ${instanceId}`);
    }

    const definition =
      towerDefinitions[tower.towerId as keyof typeof towerDefinitions];
    const effectiveMax = this.effectiveMaxLevel(tower.towerId);
    const level = definition.levels[tower.level - 1];
    if (!level || level.upgradeCost === null || tower.level >= effectiveMax) {
      throw new Error("Tower is already at maximum level");
    }
    if (this.mutableState.gold < level.upgradeCost) {
      throw new Error("Not enough gold");
    }

    this.mutableState.gold -= level.upgradeCost;
    this.mutableState.metrics.spentGold += level.upgradeCost;
    this.mutableState.metrics.authoredSpentGold += level.upgradeCost;
    this.mutableState.towers[index] = {
      ...tower,
      level: tower.level + 1,
      investedGold: tower.investedGold + level.upgradeCost,
    };
  }

  private sellTower(instanceId: string): void {
    this.requirePreparing();
    const index = this.mutableState.towers.findIndex(
      (tower) => tower.id === instanceId,
    );
    const tower = this.mutableState.towers[index];
    if (!tower) {
      throw new Error(`Unknown tower instance: ${instanceId}`);
    }

    this.mutableState.towers.splice(index, 1);
    this.mutableState.gold += Math.floor(tower.investedGold * 0.7);
    this.mutableState.metrics.soldTowers += 1;
  }

  private startWave(): void {
    this.requirePreparing();
    if (this.mutableState.waveIndex >= this.level.waves.length) {
      throw new Error("No wave remains");
    }

    this.mutableState.phase = "active";
    this.mutableState.waveStartedAtTick = this.mutableState.tick;
    this.mutableState.nextSpawnIndex = 0;
    this.mutableState.teaBreakUsedThisWave = false;
    this.mutableState.telegraphedEnvironmentHazardIds = [];
    this.mutableState.activeEnvironmentHazardIds = [];
    this.mutableState.exposedPadIds = [];
    this.mutableState.equipmentProcState.oncePerWaveIds = [];
    this.mutableState.equipmentProcState.targetCaps = {};
    for (const tower of this.mutableState.towers) {
      for (const item of equipmentForDefender(
        this.mutableState.loadoutSnapshot,
        tower.towerId as DefenderId,
      )) {
        for (const effect of item.effects) {
          if (effect.kind === "attack-counter" && effect.resets === "wave") {
            delete this.mutableState.equipmentProcState.counters[
              `${tower.id}:${effect.id}`
            ];
          }
        }
      }
    }
  }

  private activateAbility(abilityId: AbilityId, events: GameEvent[]): void {
    switch (abilityId) {
      case "royal-forkfall":
        this.activateRoyalForkfall(events);
        return;
      case "emergency-tea-break":
        this.activateEmergencyTeaBreak(events);
        return;
      default:
        assertNever(abilityId);
    }
  }

  private recordAbilityActivation(abilityId: AbilityId): void {
    const activations = this.mutableState.metrics.abilityActivations;
    activations[abilityId] = (activations[abilityId] ?? 0) + 1;
  }

  private activateRoyalForkfall(events: GameEvent[]): void {
    const state = this.mutableState;
    if (state.phase !== "active") {
      throw new Error("Royal Forkfall can only be used during a wave");
    }
    if (state.abilityChargeTicks < ROYAL_FORKFALL_CHARGE_TICKS) {
      throw new Error("Royal Forkfall is still charging");
    }
    const target = [...state.enemies].sort((left, right) =>
      this.compareEnemyProgress(left, right),
    )[0];
    if (!target) {
      throw new Error("Royal Forkfall needs an enemy target");
    }

    const healthBefore = target.health;
    this.damageEnemy(target.id, ROYAL_FORKFALL_DAMAGE, "arcane", false, events);
    const healthAfter =
      state.enemies.find((enemy) => enemy.id === target.id)?.health ?? 0;
    state.abilityChargeTicks = 0;
    this.recordAbilityActivation("royal-forkfall");
    events.push({
      type: "ability-activated",
      targetInstanceId: target.id,
      damageDealt: healthBefore - healthAfter,
    });
  }

  private activateEmergencyTeaBreak(events: GameEvent[]): void {
    const state = this.mutableState;
    if (state.phase !== "active") {
      throw new Error("Emergency Tea Break can only be used during a wave");
    }
    if (!this.isAbilityUnlocked("emergency-tea-break")) {
      throw new Error("Emergency Tea Break has not been unlocked");
    }
    if (state.teaBreakUsedThisWave) {
      throw new Error("Emergency Tea Break has already been used this wave");
    }

    const affected: string[] = [];
    for (const enemy of state.enemies) {
      const definition = enemyDefinition(enemy.enemyId);
      if (definition.boss) {
        continue;
      }
      if (
        this.applySlow(enemy.id, EMERGENCY_TEA_BREAK_SLOW_TICKS, {
          extend: true,
        })
      ) {
        affected.push(enemy.id);
      }
    }

    state.teaBreakUsedThisWave = true;
    this.recordAbilityActivation("emergency-tea-break");
    affected.sort();
    events.push({ type: "tea-break-activated", affectedInstanceIds: affected });
  }

  private isAbilityUnlocked(abilityId: AbilityId): boolean {
    if (abilityId === "royal-forkfall") {
      return true;
    }
    return Object.values(rewardDefinitions).some(
      (reward) =>
        reward.kind === "ability" &&
        reward.abilityId === abilityId &&
        this.unlockedRewardIds.has(reward.id),
    );
  }

  private effectiveMaxLevel(towerId: string): number {
    const definition =
      towerDefinitions[towerId as keyof typeof towerDefinitions];
    const reward = Object.values(rewardDefinitions).find(
      (candidate) =>
        candidate.kind === "tower-rank" && candidate.towerId === towerId,
    );
    if (
      reward &&
      reward.kind === "tower-rank" &&
      this.unlockedRewardIds.has(reward.id)
    ) {
      return Math.min(definition.levels.length, reward.unlockedLevel);
    }
    return definition.baseMaxLevel;
  }

  private isPadShutDown(pad: TowerPadDefinition): boolean {
    const state = this.mutableState;
    if (state.exposedPadIds.includes(pad.id)) {
      return true;
    }
    if (!pad.shutdowns || pad.shutdowns.length === 0) {
      return false;
    }
    if (state.waveStartedAtTick === null) {
      return false;
    }
    const elapsed = state.tick - state.waveStartedAtTick;
    const extraTicks = state.modifierIds.reduce(
      (total, id) =>
        total +
        modifierDefinitions[id as keyof typeof modifierDefinitions]
          .padShutdownExtraTicks,
      0,
    );
    return pad.shutdowns.some(
      (window) =>
        window.waveIndex === state.waveIndex &&
        elapsed >= window.fromTick &&
        elapsed < window.toTick + extraTicks,
    );
  }

  private applySlow(
    instanceId: string,
    ticks: number,
    options: { extend?: boolean; percent?: number } = {},
  ): boolean {
    const state = this.mutableState;
    if (ticks <= 0) {
      return false;
    }
    const index = state.enemies.findIndex((enemy) => enemy.id === instanceId);
    const enemy = state.enemies[index];
    if (!enemy) {
      return false;
    }
    const definition = enemyDefinition(enemy.enemyId);
    const slowImmune =
      definition.traits?.some((trait) => trait.kind === "slow-immune") ?? false;
    const currentStatus = expireEnemyStatus(
      enemy.status ?? EMPTY_ENEMY_STATUS,
      state.tick,
    );
    const incomingPercent = Math.min(
      definition.boss ? 20 : 60,
      options.percent ?? towerDefinitions.bardbarian.slowPercent,
    );
    if (
      slowImmune ||
      (!options.extend &&
        currentStatus.slow !== null &&
        currentStatus.slow.untilTick > state.tick &&
        currentStatus.slow.percent >= incomingPercent)
    ) {
      return false;
    }
    const application = applyEnemyStatus(
      currentStatus,
      {
        kind: "slow",
        percent: incomingPercent,
        ticks,
      },
      { boss: definition.boss, slowImmune },
      state.tick,
    );
    state.enemies[index] = {
      ...enemy,
      slowUntilTick: Math.max(enemy.slowUntilTick, state.tick + ticks),
      status: application.status,
    };
    return application.outcome === "applied";
  }

  private requirePreparing(): void {
    if (this.mutableState.phase !== "preparing") {
      throw new Error("Towers can only be managed between waves");
    }
  }

  private requireTowerManagement(): void {
    if (
      this.mutableState.phase !== "preparing" &&
      this.mutableState.phase !== "active"
    ) {
      throw new Error("Towers cannot be managed after the battle");
    }
  }

  private tick(events: GameEvent[]): void {
    const state = this.mutableState;
    state.tick += 1;
    state.abilityChargeTicks = Math.min(
      ROYAL_FORKFALL_CHARGE_TICKS,
      state.abilityChargeTicks + 1,
    );
    this.updateEnvironmentHazards(events);
    this.spawnEnemies(events);
    this.attackWithTowers(events);
    this.moveEnemies(events);

    if (state.lives <= 0) {
      state.phase = "defeat";
      events.push({
        type: "battle-complete",
        result: "defeat",
        completedMasteryIds: [],
      });
      return;
    }

    const wave = this.level.waves[state.waveIndex];
    if (
      wave &&
      state.nextSpawnIndex >= wave.spawns.length &&
      state.enemies.length === 0
    ) {
      const completedWave = state.waveIndex;
      state.waveIndex += 1;
      state.waveStartedAtTick = null;
      state.nextSpawnIndex = 0;
      state.teaBreakUsedThisWave = false;
      state.telegraphedEnvironmentHazardIds = [];
      state.activeEnvironmentHazardIds = [];
      state.exposedPadIds = [];
      state.towers = state.towers.map((tower) => ({
        ...tower,
        nextAttackTick: state.tick,
      }));
      events.push({ type: "wave-complete", waveIndex: completedWave });

      if (state.waveIndex >= this.level.waves.length) {
        state.phase = "victory";
        state.completedMasteryIds = this.evaluateMastery();
        state.score +=
          state.lives * 500 +
          state.gold * 5 +
          state.completedMasteryIds.length * 2_000;
        events.push({
          type: "battle-complete",
          result: "victory",
          completedMasteryIds: [...state.completedMasteryIds],
        });
      } else {
        state.phase = "preparing";
        state.gold += 25 + state.waveIndex * 5;
      }
    }
  }

  private updateEnvironmentHazards(events: GameEvent[]): void {
    const state = this.mutableState;
    if (state.waveStartedAtTick === null) {
      return;
    }
    const elapsed = state.tick - state.waveStartedAtTick;
    const extraTicks = state.modifierIds.reduce(
      (total, id) =>
        total +
        modifierDefinitions[id as keyof typeof modifierDefinitions]
          .padShutdownExtraTicks,
      0,
    );
    const hazards = (this.level.environmentHazards ?? []).filter(
      (hazard) => hazard.waveIndex === state.waveIndex,
    );
    const telegraphed = hazards
      .filter(
        (hazard) =>
          elapsed >= hazard.telegraphFromTick &&
          elapsed < hazard.activeFromTick,
      )
      .map((hazard) => hazard.id)
      .sort();
    const active = hazards
      .filter(
        (hazard) =>
          elapsed >= hazard.activeFromTick &&
          elapsed < hazard.activeToTick + extraTicks,
      )
      .map((hazard) => hazard.id)
      .sort();

    for (const hazardId of telegraphed) {
      if (!state.telegraphedEnvironmentHazardIds.includes(hazardId)) {
        events.push({
          type: "environment-hazard-telegraphed",
          hazardId,
        });
      }
    }
    for (const hazardId of active) {
      if (state.activeEnvironmentHazardIds.includes(hazardId)) {
        continue;
      }
      const hazard = hazards.find((candidate) => candidate.id === hazardId)!;
      const occupiedExposedPads = hazard.exposedPadIds.filter((padId) =>
        state.towers.some((tower) => tower.padId === padId),
      );
      state.metrics.exposedPadUses += occupiedExposedPads.length;
      events.push({
        type: "environment-hazard-started",
        hazardId,
        exposedPadIds: [...hazard.exposedPadIds],
      });
    }
    for (const hazardId of state.activeEnvironmentHazardIds) {
      if (!active.includes(hazardId)) {
        events.push({ type: "environment-hazard-ended", hazardId });
      }
    }

    state.telegraphedEnvironmentHazardIds = telegraphed;
    state.activeEnvironmentHazardIds = active;
    state.exposedPadIds = Array.from(
      new Set(
        hazards
          .filter((hazard) => active.includes(hazard.id))
          .flatMap((hazard) => hazard.exposedPadIds),
      ),
    ).sort();
  }

  private spawnEnemies(events: GameEvent[]): void {
    const state = this.mutableState;
    const wave = this.level.waves[state.waveIndex];
    if (!wave || state.waveStartedAtTick === null) {
      return;
    }

    const elapsed = state.tick - state.waveStartedAtTick;
    const spawnIntervalPercent = state.modifierIds.reduce(
      (percent, modifierId) =>
        Math.floor(
          (percent *
            modifierDefinitions[modifierId as keyof typeof modifierDefinitions]
              .spawnIntervalPercent) /
            100,
        ),
      100,
    );
    while (state.nextSpawnIndex < wave.spawns.length) {
      const spawn = wave.spawns[state.nextSpawnIndex];
      const effectiveAtTick = spawn
        ? Math.floor((spawn.atTick * spawnIntervalPercent) / 100)
        : Number.POSITIVE_INFINITY;
      if (!spawn || effectiveAtTick > elapsed) {
        break;
      }

      this.spawnEnemyInstance(
        spawn.enemyId,
        spawn.routeId ?? this.defaultRouteId,
        events,
      );
      state.nextSpawnIndex += 1;
    }
  }

  private spawnEnemyInstance(
    enemyId: string,
    routeId: string,
    events: GameEvent[],
    startDistanceMilli = 0,
    referred = false,
    startingHealthPercent = 100,
  ): void {
    const state = this.mutableState;
    const definition = enemyDefinition(enemyId);

    const healthPercent = state.modifierIds.reduce(
      (percent, modifierId) =>
        Math.floor(
          (percent *
            modifierDefinitions[modifierId as keyof typeof modifierDefinitions]
              .enemyHealthPercent) /
            100,
        ),
      100,
    );
    const maxHealth = Math.ceil((definition.maxHealth * healthPercent) / 100);
    const health = Math.ceil((maxHealth * startingHealthPercent) / 100);
    this.enemyCounter += 1;
    const instanceId = `enemy-${this.enemyCounter}`;
    const preparedPath =
      this.routePaths.get(routeId) ?? this.routePaths.get(this.defaultRouteId)!;
    const referredReachedHalfway =
      referred && startDistanceMilli * 2 >= preparedPath.totalDistanceMilli;
    if (referredReachedHalfway) {
      state.metrics.referredEnemiesReachedHalfway += 1;
      events.push({
        type: "referred-enemy-reached-halfway",
        instanceId,
      });
    }
    state.enemies.push({
      id: instanceId,
      enemyId,
      health,
      maxHealth,
      pathDistanceMilli: startDistanceMilli,
      slowUntilTick: 0,
      variant: this.spawnRandom.int(3),
      routeId,
      bossPhase: false,
      bossPhaseIndex: 0,
      wardConsumed: false,
      referred,
      spectral: referred,
      referredReachedHalfway,
      activeBossStageId: definition.initialBossStage?.id ?? null,
      status: EMPTY_ENEMY_STATUS,
    });
    events.push({
      type: "enemy-spawned",
      enemyId,
      instanceId,
    });
    if (definition.initialBossStage?.escort) {
      this.spawnEscort(definition.initialBossStage.escort, routeId, events);
    }
  }

  private spawnEscort(
    escort: BossEscortDefinition,
    routeId: string,
    events: GameEvent[],
  ): void {
    for (let index = 0; index < escort.count; index += 1) {
      this.spawnEnemyInstance(escort.enemyId, routeId, events);
    }
  }

  private attackWithTowers(events: GameEvent[]): void {
    const state = this.mutableState;
    const orderedTowerIds = state.towers
      .map((tower) => tower.id)
      .sort(compareTowerInstanceIds);

    for (const towerInstanceId of orderedTowerIds) {
      const towerIndex = state.towers.findIndex(
        (tower) => tower.id === towerInstanceId,
      );
      const tower = state.towers[towerIndex];
      if (!tower || tower.nextAttackTick > state.tick) {
        continue;
      }

      const definition = towerDefinition(tower.towerId);
      const level = definition.levels[tower.level - 1];
      const pad = this.level.pads.find(
        (candidate) => candidate.id === tower.padId,
      );
      if (!level || !pad) {
        throw new Error(`Invalid tower state: ${tower.id}`);
      }
      if (this.isPadShutDown(pad)) {
        continue;
      }

      const defenderId = tower.towerId as DefenderId;
      const openingStats = this.statsFor(
        defenderId,
        level,
        definition.splashRadius,
      );
      const range = openingStats.range;
      const targets = state.enemies
        .filter(
          (enemy) =>
            squaredDistance(pad.position, this.getEnemyPosition(enemy)) <=
            range * range,
        )
        .sort((left, right) => this.compareEnemyProgress(left, right));

      const primaryTargets = targets.slice(0, 1 + (level.pierceCount ?? 0));
      const target = primaryTargets[0];
      if (!target) {
        continue;
      }

      const splashRadius = openingStats.splashRadius;
      const affectedIds = new Set<string>();
      for (const primary of primaryTargets) {
        affectedIds.add(primary.id);
        if (splashRadius > 0) {
          const primaryPosition = this.getEnemyPosition(primary);
          for (const enemy of state.enemies) {
            if (
              squaredDistance(primaryPosition, this.getEnemyPosition(enemy)) <=
              splashRadius * splashRadius
            ) {
              affectedIds.add(enemy.id);
            }
          }
        }
      }
      const affected = [...affectedIds]
        .sort((left, right) => left.localeCompare(right))
        .map((id) => state.enemies.find((enemy) => enemy.id === id))
        .filter((enemy): enemy is EnemyState => enemy !== undefined);

      let damageDealt = 0;
      let defeatedCount = 0;
      let primarySlowApplied = false;
      for (const enemy of affected) {
        const enemyStats = this.statsFor(
          defenderId,
          level,
          definition.splashRadius,
          enemy,
        );
        const dealt = this.damageEnemy(
          enemy.id,
          enemyStats.damage,
          definition.damageType,
          Boolean(level.ignoresArmor),
          events,
          enemyStats.armorIgnorePercent,
          tower.id,
        );
        damageDealt += dealt;
        if (!state.enemies.some((candidate) => candidate.id === enemy.id)) {
          defeatedCount += 1;
        }
        const slowApplied = this.applySlow(enemy.id, definition.slowTicks, {
          percent: definition.slowPercent,
        });
        if (enemy.id === target.id) {
          primarySlowApplied = slowApplied;
        }
      }

      const items = equipmentForDefender(state.loadoutSnapshot, defenderId);
      if (primarySlowApplied && splashRadius > 0) {
        const primaryPosition = this.getEnemyPosition(target);
        for (const item of items) {
          for (const effect of item.effects) {
            if (effect.kind !== "secondary-slow") {
              continue;
            }
            const secondary = targets
              .filter((candidate) => {
                if (candidate.id === target.id) {
                  return false;
                }
                const current = state.enemies.find(
                  (enemy) => enemy.id === candidate.id,
                );
                return (
                  current !== undefined &&
                  !enemyDefinition(current.enemyId).boss &&
                  !expireEnemyStatus(
                    current.status ?? EMPTY_ENEMY_STATUS,
                    state.tick,
                  ).hardControl &&
                  squaredDistance(
                    primaryPosition,
                    this.getEnemyPosition(current),
                  ) <=
                    splashRadius * splashRadius
                );
              })
              .sort((left, right) => {
                const distance =
                  squaredDistance(
                    primaryPosition,
                    this.getEnemyPosition(left),
                  ) -
                  squaredDistance(
                    primaryPosition,
                    this.getEnemyPosition(right),
                  );
                return distance || left.id.localeCompare(right.id);
              })[0];
            if (secondary) {
              this.applyEquipmentStatus(
                item.id,
                effect.id,
                tower.id,
                secondary.id,
                {
                  kind: "slow",
                  percent: effect.slowPercent,
                  ticks: effect.ticks,
                },
                false,
                events,
              );
            }
          }
        }
      }
      const secondaryEffect = items
        .flatMap((item) =>
          item.effects.map((effect) => ({ itemId: item.id, effect })),
        )
        .find(
          (
            entry,
          ): entry is {
            itemId: string;
            effect: Extract<EquipmentEffect, { kind: "secondary-target" }>;
          } => entry.effect.kind === "secondary-target",
        );
      const secondaryTarget = targets.find(
        (candidate) => !affectedIds.has(candidate.id),
      );
      if (secondaryEffect && secondaryTarget) {
        const percent =
          tower.level === 4
            ? secondaryEffect.effect.damagePercentRankFour
            : secondaryEffect.effect.damagePercentRanksOneToThree;
        const secondaryStats = this.statsFor(
          defenderId,
          level,
          definition.splashRadius,
          secondaryTarget,
        );
        const dealt = this.damageEnemy(
          secondaryTarget.id,
          Math.max(1, Math.floor((secondaryStats.damage * percent) / 100)),
          definition.damageType,
          Boolean(level.ignoresArmor),
          events,
          secondaryStats.armorIgnorePercent,
          tower.id,
        );
        damageDealt += dealt;
        if (
          !state.enemies.some(
            (candidate) => candidate.id === secondaryTarget.id,
          )
        ) {
          defeatedCount += 1;
        }
        this.recordEquipmentContribution(secondaryEffect.itemId, {
          echoDamage: dealt,
        });
        events.push({
          type: "equipment-effect",
          itemId: secondaryEffect.itemId,
          effectId: secondaryEffect.effect.id,
          sourceInstanceId: tower.id,
          targetInstanceId: secondaryTarget.id,
          outcome: "applied",
          message:
            tower.level === 4
              ? "Rank IV secondary target hit for 35%"
              : "Secondary target hit for 60%",
        });
      }

      const cooldownAdjustment = this.processPrimaryEquipmentEffects(
        tower,
        target,
        targets,
        openingStats.damage,
        definition.damageType,
        events,
      );
      const cooldown = Math.max(
        Math.ceil((level.cooldownTicks * 70) / 100),
        Math.round(
          (this.cooldownFor(tower, openingStats.cooldownTicks) *
            (100 + cooldownAdjustment)) /
            100,
        ),
      );
      state.towers[towerIndex] = {
        ...tower,
        nextAttackTick: state.tick + cooldown,
      };
      events.push({
        type: "tower-attacked",
        towerId: tower.towerId,
        towerInstanceId: tower.id,
        targetInstanceId: target.id,
        affectedInstanceIds: affected.map((enemy) => enemy.id),
        damageDealt,
        defeatedCount,
      });
    }
  }

  private statsFor(
    defenderId: DefenderId,
    level: TowerLevelDefinition,
    authoredSplashRadius: number,
    target?: EnemyState,
  ) {
    const state = this.mutableState;
    const targetDefinition = target
      ? enemyDefinition(target.enemyId)
      : undefined;
    const route = target
      ? (this.routePaths.get(target.routeId) ??
        this.routePaths.get(this.defaultRouteId)!)
      : undefined;
    const progressPercent =
      target && route
        ? (target.pathDistanceMilli / route.totalDistanceMilli) * 100
        : undefined;
    const waveElapsedTicks =
      state.waveStartedAtTick === null
        ? 0
        : state.tick - state.waveStartedAtTick;
    const deployedDefenderIds = new Set(
      state.towers.map((tower) => tower.towerId as DefenderId),
    );
    const stats = applyEquipmentStats(
      {
        damage: level.damage,
        cooldownTicks: level.cooldownTicks,
        range: this.effectiveRange(level),
        splashRadius: level.splashRadiusOverride ?? authoredSplashRadius,
        armorIgnorePercent: 0,
      },
      defenderId,
      state.loadoutSnapshot,
      {
        ...(progressPercent === undefined
          ? {}
          : { routeProgressPercent: progressPercent }),
        ...(targetDefinition
          ? { boss: targetDefinition.boss, armor: targetDefinition.armor }
          : {}),
        waveElapsedTicks,
        deployedDefenderIds,
      },
    );
    const chorusActive =
      (state.equipmentProcState.activeBuffUntilTicks["forbidden-chorus"] ?? 0) >
      state.tick;
    const leakHasteActive =
      (state.equipmentProcState.activeBuffUntilTicks[
        `leak-haste:${defenderId}`
      ] ?? 0) > state.tick;
    const cooldownMultiplier =
      (chorusActive ? 0.9 : 1) * (leakHasteActive ? 0.8 : 1);
    return {
      ...stats,
      cooldownTicks: Math.max(
        Math.ceil((level.cooldownTicks * 70) / 100),
        Math.round(stats.cooldownTicks * cooldownMultiplier),
      ),
      range: chorusActive ? Math.round(stats.range * 1.1) : stats.range,
    };
  }

  private processPrimaryEquipmentEffects(
    tower: TowerState,
    originalTarget: EnemyState,
    orderedTargets: readonly EnemyState[],
    damage: number,
    damageType: "physical" | "arcane" | "sonic",
    events: GameEvent[],
  ): number {
    const state = this.mutableState;
    const defenderId = tower.towerId as DefenderId;
    let cooldownAdjustment = 0;
    for (const item of equipmentForDefender(
      state.loadoutSnapshot,
      defenderId,
    )) {
      for (const effect of item.effects) {
        const key = `${tower.id}:${effect.id}`;
        if (effect.kind === "primary-proc") {
          if (
            (state.equipmentProcState.cooldownUntilTicks[key] ?? 0) >
              state.tick ||
            this.combatRandom.int(10_000) >= effect.chanceBasisPoints
          ) {
            continue;
          }
          state.equipmentProcState.cooldownUntilTicks[key] =
            state.tick + effect.cooldownTicks;
          const target = state.enemies.find(
            (enemy) => enemy.id === originalTarget.id,
          );
          if (!target) {
            continue;
          }
          const definition = enemyDefinition(target.enemyId);
          if (definition.boss) {
            if (effect.boss.kind === "bonus-damage") {
              const bonus = this.damageEnemy(
                target.id,
                Math.max(1, Math.floor((damage * effect.boss.percent) / 100)),
                damageType,
                false,
                events,
                0,
                tower.id,
              );
              this.recordEquipmentContribution(item.id, {
                procCount: 1,
                directBonusDamage: bonus,
              });
              events.push({
                type: "equipment-effect",
                itemId: item.id,
                effectId: effect.id,
                sourceInstanceId: tower.id,
                targetInstanceId: target.id,
                outcome: "converted",
                message: `Boss resisted ${effect.normal.kind} - bonus damage applied`,
              });
            } else {
              const outcome = this.applyEquipmentStatus(
                item.id,
                effect.id,
                tower.id,
                target.id,
                {
                  kind: "slow",
                  percent: effect.boss.slowPercent,
                  ticks: effect.boss.ticks,
                },
                true,
                events,
              );
              if (outcome === "applied") {
                this.recordEquipmentContribution(item.id, { procCount: 1 });
              }
            }
          } else {
            const slowImmune =
              definition.traits?.some(
                (trait) => trait.kind === "slow-immune",
              ) ?? false;
            if (
              slowImmune &&
              effect.normal.kind === "polymorph" &&
              effect.boss.kind === "bonus-damage"
            ) {
              const bonus = this.damageEnemy(
                target.id,
                Math.max(1, Math.floor((damage * effect.boss.percent) / 100)),
                damageType,
                false,
                events,
                0,
                tower.id,
              );
              this.recordEquipmentContribution(item.id, {
                procCount: 1,
                directBonusDamage: bonus,
              });
              events.push({
                type: "equipment-effect",
                itemId: item.id,
                effectId: effect.id,
                sourceInstanceId: tower.id,
                targetInstanceId: target.id,
                outcome: "converted",
                message: "Control immunity converted polymorph to bonus damage",
              });
            } else {
              const outcome = this.applyEquipmentStatus(
                item.id,
                effect.id,
                tower.id,
                target.id,
                effect.normal,
                false,
                events,
              );
              if (outcome === "applied") {
                this.recordEquipmentContribution(item.id, { procCount: 1 });
              }
            }
          }
          continue;
        }
        if (effect.kind === "attack-counter") {
          const count = (state.equipmentProcState.counters[key] ?? 0) + 1;
          state.equipmentProcState.counters[key] = count;
          if (count % effect.every !== 0) {
            continue;
          }
          switch (effect.action.kind) {
            case "cooldown-percent":
              cooldownAdjustment += effect.action.percent;
              this.recordEquipmentContribution(item.id, { procCount: 1 });
              events.push({
                type: "equipment-effect",
                itemId: item.id,
                effectId: effect.id,
                sourceInstanceId: tower.id,
                targetInstanceId: originalTarget.id,
                outcome: "applied",
                message: "Counter shortened the next attack cooldown",
              });
              break;
            case "echo": {
              const echoTarget =
                effect.action.target === "primary"
                  ? state.enemies.find(
                      (enemy) => enemy.id === originalTarget.id,
                    )
                  : orderedTargets.find(
                      (candidate) =>
                        candidate.id !== originalTarget.id &&
                        state.enemies.some(
                          (enemy) => enemy.id === candidate.id,
                        ),
                    );
              if (!echoTarget) {
                break;
              }
              const dealt = this.damageEnemy(
                echoTarget.id,
                Math.max(
                  1,
                  Math.floor((damage * effect.action.damagePercent) / 100),
                ),
                damageType,
                false,
                events,
                0,
                tower.id,
              );
              this.recordEquipmentContribution(item.id, {
                procCount: 1,
                echoDamage: dealt,
              });
              events.push({
                type: "equipment-effect",
                itemId: item.id,
                effectId: effect.id,
                sourceInstanceId: tower.id,
                targetInstanceId: echoTarget.id,
                outcome: "applied",
                message: "Nonrecursive echo damage applied",
              });
              break;
            }
            case "push-or-boss-mark": {
              const target = state.enemies.find(
                (enemy) => enemy.id === originalTarget.id,
              );
              if (!target) {
                break;
              }
              const definition = enemyDefinition(target.enemyId);
              if (definition.boss) {
                this.recordEquipmentContribution(item.id, { procCount: 1 });
                this.applyEquipmentStatus(
                  item.id,
                  effect.id,
                  tower.id,
                  target.id,
                  {
                    kind: "mark",
                    ticks: effect.action.markTicks,
                    damagePercent: effect.action.alliedDamagePercent,
                    damageTypes: ["arcane", "sonic"],
                    sourceInstanceId: tower.id,
                    sourceMode: "exclude",
                  },
                  true,
                  events,
                  "Boss resisted displacement - Set for the Party",
                );
              } else {
                const capKey = `${state.waveIndex}:${effect.id}:${target.id}`;
                const prior = state.equipmentProcState.targetCaps[capKey] ?? 0;
                const appliedPercent = Math.min(
                  effect.action.pushRoutePercent,
                  effect.action.perTargetWaveCapPercent - prior,
                );
                if (appliedPercent > 0) {
                  const route =
                    this.routePaths.get(target.routeId) ??
                    this.routePaths.get(this.defaultRouteId)!;
                  const index = state.enemies.findIndex(
                    (enemy) => enemy.id === target.id,
                  );
                  state.enemies[index] = {
                    ...target,
                    pathDistanceMilli: Math.max(
                      0,
                      target.pathDistanceMilli -
                        Math.floor(
                          (route.totalDistanceMilli * appliedPercent) / 100,
                        ),
                    ),
                  };
                  state.equipmentProcState.targetCaps[capKey] =
                    prior + appliedPercent;
                  this.recordEquipmentContribution(item.id, { procCount: 1 });
                  events.push({
                    type: "equipment-effect",
                    itemId: item.id,
                    effectId: effect.id,
                    sourceInstanceId: tower.id,
                    targetInstanceId: target.id,
                    outcome: "applied",
                    message: `Target pushed back ${appliedPercent}%`,
                  });
                }
              }
              break;
            }
            case "team-haste":
              if (
                (state.equipmentProcState.teamCooldownUntilTicks[effect.id] ??
                  0) <= state.tick
              ) {
                state.equipmentProcState.teamCooldownUntilTicks[effect.id] =
                  state.tick + effect.action.cooldownTicks;
                state.equipmentProcState.activeBuffUntilTicks[
                  "forbidden-chorus"
                ] = state.tick + effect.action.ticks;
                this.recordEquipmentContribution(item.id, {
                  procCount: 1,
                  teamBuffUptimeTicks: effect.action.ticks,
                });
                events.push({
                  type: "equipment-effect",
                  itemId: item.id,
                  effectId: effect.id,
                  sourceInstanceId: tower.id,
                  targetInstanceId: null,
                  outcome: "applied",
                  message: "Team chorus started",
                });
              }
              break;
          }
          continue;
        }
        if (effect.kind === "route-mark") {
          const battleKey = `${item.id}:${effect.id}`;
          const target = state.enemies.find(
            (enemy) => enemy.id === originalTarget.id,
          );
          if (
            !target ||
            state.equipmentProcState.oncePerBattleIds.includes(battleKey)
          ) {
            continue;
          }
          const route =
            this.routePaths.get(target.routeId) ??
            this.routePaths.get(this.defaultRouteId)!;
          const progress =
            (target.pathDistanceMilli / route.totalDistanceMilli) * 100;
          if (progress < effect.minimumProgressPercent) {
            continue;
          }
          state.equipmentProcState.oncePerBattleIds.push(battleKey);
          const boss = enemyDefinition(target.enemyId).boss;
          this.applyEquipmentStatus(
            item.id,
            effect.id,
            tower.id,
            target.id,
            {
              kind: "slow",
              percent: boss ? effect.bossSlowPercent : effect.normalSlowPercent,
              ticks: boss ? effect.bossTicks : effect.normalTicks,
            },
            boss,
            events,
            boss ? "Boss resisted mark - slowed instead" : undefined,
          );
          if (!boss) {
            this.applyEquipmentStatus(
              item.id,
              effect.id,
              tower.id,
              target.id,
              {
                kind: "mark",
                ticks: effect.normalTicks,
                damagePercent: effect.normalDamagePercent,
                sourceInstanceId: tower.id,
                sourceMode: "only",
              },
              false,
              events,
            );
          }
        }
      }
    }
    return cooldownAdjustment;
  }

  private applyEquipmentStatus(
    itemId: string,
    effectId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    request:
      | { kind: "slow"; percent: number; ticks: number }
      | { kind: "freeze"; ticks: number }
      | { kind: "polymorph"; ticks: number; slowPercent: number }
      | {
          kind: "mark";
          ticks: number;
          damagePercent: number;
          damageTypes?: readonly ("physical" | "arcane" | "sonic")[];
          sourceInstanceId?: string;
          sourceMode?: "only" | "exclude";
        },
    converted: boolean,
    events: GameEvent[],
    convertedMessage?: string,
  ): "applied" | "immune" | "rejected" | "missing" {
    const state = this.mutableState;
    const index = state.enemies.findIndex(
      (enemy) => enemy.id === targetInstanceId,
    );
    const enemy = state.enemies[index];
    if (!enemy) {
      return "missing";
    }
    const definition = enemyDefinition(enemy.enemyId);
    const slowImmune =
      definition.traits?.some((trait) => trait.kind === "slow-immune") ?? false;
    const application = applyEnemyStatus(
      enemy.status ?? EMPTY_ENEMY_STATUS,
      request,
      { boss: definition.boss, slowImmune },
      state.tick,
    );
    state.enemies[index] = { ...enemy, status: application.status };
    const isControl = request.kind !== "mark";
    this.recordEquipmentContribution(itemId, {
      controlTicksApplied: isControl ? application.appliedTicks : 0,
      controlTicksRejected:
        !isControl || application.outcome === "applied"
          ? 0
          : "ticks" in request
            ? request.ticks
            : 0,
    });
    const outcome =
      application.outcome === "applied" && converted
        ? "converted"
        : application.outcome;
    events.push({
      type: "equipment-effect",
      itemId,
      effectId,
      sourceInstanceId,
      targetInstanceId,
      outcome,
      message:
        outcome === "converted"
          ? (convertedMessage ??
            `Boss resisted control - ${request.kind} conversion applied`)
          : outcome === "immune"
            ? "Immune"
            : outcome === "rejected"
              ? application.rejectionReason === "dominated-slow"
                ? "Stronger or longer slow already active"
                : "Control rejected during resolve"
              : `${request.kind} applied`,
    });
    return application.outcome;
  }

  private recordEquipmentContribution(
    itemId: string,
    delta: Partial<EquipmentContribution>,
  ): void {
    const previous = this.mutableState.metrics.equipment[itemId] ?? {
      procCount: 0,
      directBonusDamage: 0,
      echoDamage: 0,
      controlTicksApplied: 0,
      controlTicksRejected: 0,
      goldSaved: 0,
      lifeDamagePrevented: 0,
      teamBuffUptimeTicks: 0,
    };
    this.mutableState.metrics.equipment[itemId] = {
      procCount: previous.procCount + (delta.procCount ?? 0),
      directBonusDamage:
        previous.directBonusDamage + (delta.directBonusDamage ?? 0),
      echoDamage: previous.echoDamage + (delta.echoDamage ?? 0),
      controlTicksApplied:
        previous.controlTicksApplied + (delta.controlTicksApplied ?? 0),
      controlTicksRejected:
        previous.controlTicksRejected + (delta.controlTicksRejected ?? 0),
      goldSaved: previous.goldSaved + (delta.goldSaved ?? 0),
      lifeDamagePrevented:
        previous.lifeDamagePrevented + (delta.lifeDamagePrevented ?? 0),
      teamBuffUptimeTicks:
        previous.teamBuffUptimeTicks + (delta.teamBuffUptimeTicks ?? 0),
    };
  }

  private activateLeakEquipment(
    leakedEnemy: EnemyState,
    events: GameEvent[],
  ): void {
    const state = this.mutableState;
    for (const defenderId of [
      "fork-knight",
      "discount-wizard",
      "bardbarian",
    ] as const) {
      const source = state.towers
        .filter((tower) => tower.towerId === defenderId)
        .sort((left, right) => compareTowerInstanceIds(left.id, right.id))[0];
      if (!source) {
        continue;
      }
      for (const item of equipmentForDefender(
        state.loadoutSnapshot,
        defenderId,
      )) {
        for (const effect of item.effects) {
          if (effect.kind !== "leak-haste") {
            continue;
          }
          const key = `${state.waveIndex}:${item.id}:${effect.id}`;
          if (state.equipmentProcState.oncePerWaveIds.includes(key)) {
            continue;
          }
          state.equipmentProcState.oncePerWaveIds.push(key);
          state.equipmentProcState.activeBuffUntilTicks[
            `leak-haste:${defenderId}`
          ] = state.tick + effect.ticks;
          this.recordEquipmentContribution(item.id, {
            procCount: 1,
            teamBuffUptimeTicks: effect.ticks,
          });
          events.push({
            type: "equipment-effect",
            itemId: item.id,
            effectId: effect.id,
            sourceInstanceId: source.id,
            targetInstanceId: leakedEnemy.id,
            outcome: "applied",
            message: "Leak haste activated",
          });
        }
      }
    }
  }

  private preventLeakDamage(
    leakedEnemy: EnemyState,
    incomingDamage: number,
    events: GameEvent[],
  ): number {
    const state = this.mutableState;
    if (enemyDefinition(leakedEnemy.enemyId).boss) {
      return 0;
    }
    let prevented = 0;
    for (const defenderId of [
      "fork-knight",
      "discount-wizard",
      "bardbarian",
    ] as const) {
      const source = state.towers
        .filter((tower) => tower.towerId === defenderId)
        .sort((left, right) => compareTowerInstanceIds(left.id, right.id))[0];
      if (!source) {
        continue;
      }
      for (const item of equipmentForDefender(
        state.loadoutSnapshot,
        defenderId,
      )) {
        for (const effect of item.effects) {
          if (effect.kind !== "prevent-leak-damage") {
            continue;
          }
          const key = `${item.id}:${effect.id}`;
          if (
            state.equipmentProcState.oncePerBattleIds.includes(key) ||
            prevented >= incomingDamage
          ) {
            continue;
          }
          const amount = Math.min(effect.amount, incomingDamage - prevented);
          state.equipmentProcState.oncePerBattleIds.push(key);
          prevented += amount;
          this.recordEquipmentContribution(item.id, {
            procCount: 1,
            lifeDamagePrevented: amount,
          });
          events.push({
            type: "equipment-effect",
            itemId: item.id,
            effectId: effect.id,
            sourceInstanceId: source.id,
            targetInstanceId: leakedEnemy.id,
            outcome: "applied",
            message: `Prevented ${amount} leak damage`,
          });
        }
      }
    }
    return prevented;
  }

  private isSupportPulseActive(pulse: {
    readonly periodTicks: number;
    readonly activeTicks: number;
  }): boolean {
    return this.mutableState.tick % pulse.periodTicks < pulse.activeTicks;
  }

  private effectiveRange(level: TowerLevelDefinition): number {
    if (!level.supportPulse) {
      return level.range;
    }
    return (
      level.range +
      (this.isSupportPulseActive(level.supportPulse)
        ? level.supportPulse.rangeBonus
        : 0)
    );
  }

  private bossPhasesFor(
    definition: EnemyDefinition,
  ): readonly BossPhaseDefinition[] {
    if (definition.bossPhases) {
      return definition.bossPhases;
    }
    return definition.bossPhase ? [definition.bossPhase] : [];
  }

  private damageEnemy(
    instanceId: string,
    rawDamage: number,
    damageType: "physical" | "arcane" | "sonic",
    ignoresArmor: boolean,
    events: GameEvent[],
    armorIgnorePercent = 0,
    sourceInstanceId?: string,
  ): number {
    const state = this.mutableState;
    const index = state.enemies.findIndex((enemy) => enemy.id === instanceId);
    const enemy = state.enemies[index];
    if (!enemy) {
      return 0;
    }

    const definition = enemyDefinition(enemy.enemyId);

    const hasWard =
      definition.traits?.some((trait) => trait.kind === "first-hit-ward") ??
      false;
    if (hasWard && !enemy.wardConsumed) {
      state.enemies[index] = { ...enemy, wardConsumed: true };
      return 0;
    }

    const resistancePercent =
      definition.traits?.reduce((percent, trait) => {
        if (
          trait.kind !== "damage-resistance" ||
          trait.damageType !== damageType
        ) {
          return percent;
        }
        return Math.floor((percent * trait.percent) / 100);
      }, 100) ?? 100;
    const activeStatus = expireEnemyStatus(
      enemy.status ?? EMPTY_ENEMY_STATUS,
      state.tick,
    );
    const markTypeMatches =
      activeStatus.markDamageTypes === null ||
      activeStatus.markDamageTypes.includes(damageType);
    const markSourceMatches =
      activeStatus.markSourceMode === null ||
      (activeStatus.markSourceMode === "only"
        ? activeStatus.markSourceInstanceId === sourceInstanceId
        : activeStatus.markSourceInstanceId !== sourceInstanceId);
    const markedRawDamage =
      activeStatus.markUntilTick > state.tick &&
      markTypeMatches &&
      markSourceMatches
        ? Math.floor((rawDamage * (100 + activeStatus.markDamagePercent)) / 100)
        : rawDamage;
    const modifiedRawDamage = Math.max(
      1,
      Math.floor((markedRawDamage * resistancePercent) / 100),
    );

    const phases = this.bossPhasesFor(definition);
    const activePhase =
      enemy.bossPhaseIndex > 0 ? phases[enemy.bossPhaseIndex - 1] : undefined;
    const armor =
      definition.armor +
      (activePhase?.armorBonus ?? definition.initialBossStage?.armorBonus ?? 0);
    const authoredIgnoredArmor = ignoresArmor
      ? armor
      : damageType === "arcane"
        ? Math.ceil(armor / 2)
        : damageType === "sonic"
          ? armor
          : 0;
    const ignoredArmor = Math.max(
      authoredIgnoredArmor,
      Math.floor((armor * armorIgnorePercent) / 100),
    );
    const damage = Math.max(1, modifiedRawDamage - armor + ignoredArmor);
    let health = Math.max(0, enemy.health - damage);
    let bossPhaseIndex = enemy.bossPhaseIndex;
    let wardConsumed = enemy.wardConsumed;

    while (bossPhaseIndex < phases.length) {
      const phase = phases[bossPhaseIndex]!;
      const threshold = Math.floor(
        (enemy.maxHealth * phase.healthThresholdPercent) / 100,
      );
      if (health > threshold) {
        break;
      }
      health = threshold;
      bossPhaseIndex += 1;
      events.push({
        type: "boss-phase",
        instanceId,
        ...(phase.id ? { stageId: phase.id } : {}),
        ...(phase.name ? { stageName: phase.name } : {}),
        ...(phase.reinforcementCallId
          ? { reinforcementCallId: phase.reinforcementCallId }
          : {}),
      });
      if (phase.escort) {
        this.spawnEscort(phase.escort, enemy.routeId, events);
      }
      if (phase.removesWard) {
        wardConsumed = true;
      }
      if (phase.reinforcementCallId) {
        state.metrics.bossReinforcementCalls[phase.reinforcementCallId] =
          (state.metrics.bossReinforcementCalls[phase.reinforcementCallId] ??
            0) + 1;
      }
    }
    const appliedDamage = enemy.health - health;
    const bossPhase = bossPhaseIndex > 0;

    if (health <= 0) {
      const preparedPath =
        this.routePaths.get(enemy.routeId) ??
        this.routePaths.get(this.defaultRouteId)!;
      if (definition.boss) {
        state.metrics.bossDefeatPathPercent = Math.min(
          100,
          Math.floor(
            (enemy.pathDistanceMilli / preparedPath.totalDistanceMilli) * 100,
          ),
        );
        if (!state.metrics.defeatedBossEnemyIds.includes(enemy.enemyId)) {
          state.metrics.defeatedBossEnemyIds.push(enemy.enemyId);
          state.metrics.defeatedBossEnemyIds.sort();
        }
      }
      state.metrics.lastEnemyClearedTick[enemy.enemyId] = state.tick;
      state.enemies.splice(index, 1);
      state.gold += definition.reward;
      state.score += definition.maxHealth + definition.reward * 10;
      events.push({
        type: "enemy-defeated",
        instanceId,
        reward: definition.reward,
      });

      const referral = this.level.waves[state.waveIndex]?.referral;
      if (
        referral &&
        !definition.boss &&
        !enemy.referred &&
        !state.metrics.referredWaveIndices.includes(state.waveIndex)
      ) {
        state.metrics.referredWaveIndices.push(state.waveIndex);
        state.metrics.referredWaveIndices.sort((left, right) => left - right);
        this.spawnEnemyInstance(
          enemy.enemyId,
          enemy.routeId,
          events,
          enemy.pathDistanceMilli,
          true,
          referral.reviveHealthPercent,
        );
        const referredEnemy = state.enemies.at(-1)!;
        events.push({
          type: "enemy-referred",
          originalInstanceId: instanceId,
          referredInstanceId: referredEnemy.id,
          health: referredEnemy.health,
        });
      }

      const splitTrait = definition.traits?.find(
        (trait) => trait.kind === "split-on-defeat",
      );
      if (splitTrait && splitTrait.kind === "split-on-defeat") {
        state.metrics.splitSpawns += splitTrait.count;
        for (let split = 0; split < splitTrait.count; split += 1) {
          this.spawnEnemyInstance(
            splitTrait.intoEnemyId,
            enemy.routeId,
            events,
            enemy.pathDistanceMilli,
          );
        }
      }
      return appliedDamage;
    }

    state.enemies[index] = {
      ...enemy,
      health,
      bossPhase,
      bossPhaseIndex,
      wardConsumed,
      activeBossStageId:
        bossPhaseIndex > 0
          ? (phases[bossPhaseIndex - 1]?.id ?? enemy.activeBossStageId)
          : enemy.activeBossStageId,
      status: activeStatus,
    };
    return appliedDamage;
  }

  private cooldownFor(tower: TowerState, baseCooldown: number): number {
    if (tower.towerId === "bardbarian") {
      return baseCooldown;
    }

    const towerPad = this.level.pads.find((pad) => pad.id === tower.padId);
    if (!towerPad) {
      return baseCooldown;
    }

    let supportPercent = 0;
    for (const supportTower of this.mutableState.towers) {
      if (supportTower.towerId !== "bardbarian") {
        continue;
      }
      const supportPad = this.level.pads.find(
        (pad) => pad.id === supportTower.padId,
      );
      const supportDefinition = towerDefinitions.bardbarian;
      const supportLevel = supportDefinition.levels[supportTower.level - 1];
      const supportRange = supportLevel
        ? this.statsFor(
            "bardbarian",
            supportLevel,
            supportDefinition.splashRadius,
          ).range
        : 0;
      if (
        supportPad &&
        supportLevel &&
        squaredDistance(towerPad.position, supportPad.position) <=
          supportRange * supportRange
      ) {
        const equipmentBonus = equipmentForDefender(
          this.mutableState.loadoutSnapshot,
          "bardbarian",
        )
          .flatMap((item) => item.effects)
          .filter((effect) => effect.kind === "support-bonus")
          .reduce(
            (total, effect) =>
              Math.min(effect.capPercent, total + effect.percentagePoints),
            0,
          );
        supportPercent = Math.max(
          supportPercent,
          Math.min(
            30,
            supportDefinition.supportCooldownPercent + equipmentBonus,
          ),
        );
      }
    }

    return Math.max(
      1,
      Math.ceil((baseCooldown * (100 - supportPercent)) / 100),
    );
  }

  private auraSpeedPercentFor(
    enemy: EnemyState,
    position: Point,
    allEnemies: readonly EnemyState[],
  ): number {
    let percent = 100;
    for (const other of allEnemies) {
      if (other.id === enemy.id) {
        continue;
      }
      const otherDefinition = enemyDefinition(other.enemyId);
      const aura = otherDefinition.traits?.find(
        (trait) => trait.kind === "speed-aura",
      );
      if (!aura || aura.kind !== "speed-aura") {
        continue;
      }
      const otherPosition = this.getEnemyPosition(other);
      if (
        squaredDistance(position, otherPosition) <=
        aura.radius * aura.radius
      ) {
        percent = Math.max(percent, aura.speedPercent);
      }
    }
    return percent;
  }

  private speedZonePercentFor(enemy: EnemyState): number {
    const zones = this.level.speedZones;
    if (!zones || zones.length === 0) {
      return 100;
    }
    const preparedPath =
      this.routePaths.get(enemy.routeId) ??
      this.routePaths.get(this.defaultRouteId)!;
    if (preparedPath.totalDistanceMilli <= 0) {
      return 100;
    }
    const progressPercent =
      (enemy.pathDistanceMilli / preparedPath.totalDistanceMilli) * 100;
    let percent = 100;
    for (const zone of zones) {
      if (zone.routeId !== enemy.routeId) {
        continue;
      }
      if (
        zone.activationHazardId &&
        !this.mutableState.activeEnvironmentHazardIds.includes(
          zone.activationHazardId,
        )
      ) {
        continue;
      }
      if (
        progressPercent >= zone.fromPercent &&
        progressPercent <= zone.toPercent
      ) {
        percent = Math.max(percent, zone.speedPercent);
      }
    }
    return percent;
  }

  private moveEnemies(events: GameEvent[]): void {
    const state = this.mutableState;
    const survivors: EnemyState[] = [];
    const enemiesBeforeMove = state.enemies;

    for (const enemy of enemiesBeforeMove) {
      const definition = enemyDefinition(enemy.enemyId);
      const status = expireEnemyStatus(
        enemy.status ?? EMPTY_ENEMY_STATUS,
        state.tick,
      );
      const slowPercent = 100 - activeSlowPercent(status, state.tick);
      const phases = this.bossPhasesFor(definition);
      const bossPercent =
        enemy.bossPhaseIndex > 0
          ? (phases[enemy.bossPhaseIndex - 1]?.speedMultiplierPercent ?? 100)
          : 100;
      const position = this.getEnemyPosition(enemy);
      const auraPercent = this.auraSpeedPercentFor(
        enemy,
        position,
        enemiesBeforeMove,
      );
      const zonePercent = this.speedZonePercentFor(enemy);
      const speedPercent = Math.floor(
        (slowPercent * auraPercent * zonePercent) / 10_000,
      );
      const distance =
        enemy.pathDistanceMilli +
        Math.floor(
          (definition.speed * TICK_MS * speedPercent * bossPercent) / 10_000,
        );

      const preparedPath =
        this.routePaths.get(enemy.routeId) ??
        this.routePaths.get(this.defaultRouteId)!;
      if (distance >= preparedPath.totalDistanceMilli) {
        const preventedDamage = this.preventLeakDamage(
          enemy,
          definition.lifeDamage,
          events,
        );
        const lifeDamage = definition.lifeDamage - preventedDamage;
        state.lives = Math.max(0, state.lives - lifeDamage);
        state.metrics.leakedEnemies += 1;
        state.metrics.leakedByEnemyId[enemy.enemyId] =
          (state.metrics.leakedByEnemyId[enemy.enemyId] ?? 0) + 1;
        state.metrics.leakedByWaveIndex[String(state.waveIndex)] =
          (state.metrics.leakedByWaveIndex[String(state.waveIndex)] ?? 0) + 1;
        if (state.activeEnvironmentHazardIds.length > 0) {
          state.metrics.leaksDuringEnvironmentHazards += 1;
        }
        this.activateLeakEquipment(enemy, events);
        events.push({
          type: "enemy-leaked",
          instanceId: enemy.id,
          damage: lifeDamage,
        });
      } else {
        const reachedHalfway =
          enemy.referred &&
          !enemy.referredReachedHalfway &&
          distance * 2 >= preparedPath.totalDistanceMilli;
        if (reachedHalfway) {
          state.metrics.referredEnemiesReachedHalfway += 1;
          events.push({
            type: "referred-enemy-reached-halfway",
            instanceId: enemy.id,
          });
        }
        survivors.push({
          ...enemy,
          pathDistanceMilli: distance,
          status,
          referredReachedHalfway:
            enemy.referredReachedHalfway || Boolean(reachedHalfway),
        });
      }
    }

    state.enemies = survivors;
  }

  private evaluateMastery(): string[] {
    const state = this.mutableState;
    const context: MasteryContext = {
      metrics: state.metrics,
      modifierIds: state.modifierIds,
      finalGold: state.gold,
      totalTowerTypeCount: Object.keys(towerDefinitions).length,
      finalTick: state.tick,
    };

    return this.level.mastery
      .filter((mastery) => evaluateMasteryRule(mastery.rule, context))
      .map((mastery) => mastery.id);
  }

  private investedGold(towerId: string, level: number): number {
    const definition = Object.hasOwn(towerDefinitions, towerId)
      ? towerDefinitions[towerId as keyof typeof towerDefinitions]
      : undefined;
    if (!definition) {
      throw new Error(`Unknown tower: ${towerId}`);
    }
    if (level < 1 || level > definition.levels.length) {
      throw new Error(`Invalid level ${level} for ${towerId}`);
    }

    let invested = definition.cost;
    for (let current = 1; current < level; current += 1) {
      const upgrade = definition.levels[current - 1]?.upgradeCost;
      if (upgrade === null || upgrade === undefined) {
        throw new Error(`Invalid upgrade path for ${towerId}`);
      }
      invested += upgrade;
    }
    return invested;
  }
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  return new GameSimulation(options);
}

export { CONTENT_VERSION };
