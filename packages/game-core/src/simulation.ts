import {
  CONTENT_VERSION,
  type AbilityId,
  type BattleCheckpoint,
  type GameCommand,
} from "@srtg/protocol";

import {
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  rewardDefinitions,
  towerDefinitions,
} from "./content.js";
import { evaluateMasteryRule, type MasteryContext } from "./mastery.js";
import { pointAlongPath, preparePath } from "./path.js";
import { SeededRandom } from "./rng.js";
import {
  EMERGENCY_TEA_BREAK_SLOW_TICKS,
  ROYAL_FORKFALL_CHARGE_TICKS,
  ROYAL_FORKFALL_DAMAGE,
  TICK_MS,
  type BossEscortDefinition,
  type EnemyDefinition,
  type EnemyState,
  type GameEvent,
  type GameState,
  type Point,
  type Simulation,
  type SimulationOptions,
  type StepResult,
  type TowerDefinition,
  type TowerPadDefinition,
  type TowerState,
} from "./types.js";
import { validateCheckpointContent } from "./validation.js";

interface MutableMetrics {
  spentGold: number;
  leakedEnemies: number;
  leakedByEnemyId: Record<string, number>;
  soldTowers: number;
  usedTowerIds: string[];
  maxTowersPlaced: number;
  bossDefeatPathPercent: number | null;
}

interface MutableState {
  levelId: string;
  seed: number;
  modifierIds: string[];
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
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}

function squaredDistance(left: Point, right: Point): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
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
    towers: state.towers.map((tower) => ({ ...tower })),
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    metrics: {
      ...state.metrics,
      usedTowerIds: [...state.metrics.usedTowerIds],
      leakedByEnemyId: { ...state.metrics.leakedByEnemyId },
    },
    completedMasteryIds: [...state.completedMasteryIds],
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
  private readonly path;
  private readonly random;
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
    this.path = preparePath(level.path);
    this.random = new SeededRandom(seed);
    this.unlockedRewardIds = new Set(options.unlockedRewardIds ?? []);
    if (options.checkpoint) {
      const checkpointErrors = validateCheckpointContent(options.checkpoint);
      if (checkpointErrors.length > 0) {
        throw new Error(checkpointErrors[0]);
      }
      for (
        let spawned = 0;
        spawned < options.checkpoint.spawnedEnemies;
        spawned += 1
      ) {
        this.random.nextUint32();
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
          investedGold: this.investedGold(placement.towerId, placement.level),
        };
      }) ?? [];

    this.mutableState = {
      levelId,
      seed,
      modifierIds,
      tick: checkpoint?.tick ?? 0,
      phase: "preparing",
      waveIndex: checkpoint?.nextWave ?? 0,
      waveStartedAtTick: null,
      nextSpawnIndex: 0,
      lives: checkpoint?.lives ?? level.startingLives,
      gold: checkpoint?.gold ?? Math.max(0, level.startingGold + goldDelta),
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
            leakedEnemies: checkpoint.metrics.leakedEnemies,
            leakedByEnemyId: { ...(checkpoint.metrics.leakedByEnemyId ?? {}) },
            soldTowers: checkpoint.metrics.soldTowers,
            usedTowerIds: [...checkpoint.metrics.usedTowerIds],
            maxTowersPlaced: Math.max(
              checkpoint.metrics.maxTowersPlaced ?? 0,
              towers.length,
            ),
            bossDefeatPathPercent:
              checkpoint.metrics.bossDefeatPathPercent ?? null,
          }
        : {
            spentGold: 0,
            leakedEnemies: 0,
            leakedByEnemyId: {},
            soldTowers: 0,
            usedTowerIds: [],
            maxTowersPlaced: towers.length,
            bossDefeatPathPercent: null,
          },
      completedMasteryIds: [],
    };

    this.towerCounter = this.mutableState.towers.reduce((maximum, tower) => {
      const parsed = Number.parseInt(tower.id.replace("tower-", ""), 10);
      return Number.isFinite(parsed) ? Math.max(maximum, parsed) : maximum;
    }, 0);
    this.enemyCounter = checkpoint?.spawnedEnemies ?? 0;
  }

  public get state(): GameState {
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
    return pointAlongPath(this.path, enemy.pathDistanceMilli);
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
      seed: state.seed,
      modifierIds: [...state.modifierIds],
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
      })),
      metrics: {
        spentGold: state.metrics.spentGold,
        leakedEnemies: state.metrics.leakedEnemies,
        leakedByEnemyId: { ...state.metrics.leakedByEnemyId },
        soldTowers: state.metrics.soldTowers,
        usedTowerIds: [...state.metrics.usedTowerIds],
        maxTowersPlaced: state.metrics.maxTowersPlaced,
        bossDefeatPathPercent: state.metrics.bossDefeatPathPercent,
      },
    };
  }

  public stateHash(): string {
    const state = this.mutableState;
    return fnv1a(
      JSON.stringify({
        levelId: state.levelId,
        seed: state.seed,
        modifierIds: state.modifierIds,
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
    if (this.isPadShutDown(pad)) {
      throw new Error(`Tower pad ${padId} is shut down`);
    }
    if (this.mutableState.towers.some((tower) => tower.padId === padId)) {
      throw new Error(`Tower pad ${padId} is occupied`);
    }
    if (this.mutableState.gold < definition.cost) {
      throw new Error("Not enough gold");
    }

    this.towerCounter += 1;
    this.mutableState.gold -= definition.cost;
    this.mutableState.metrics.spentGold += definition.cost;
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
      investedGold: definition.cost,
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

  private activateRoyalForkfall(events: GameEvent[]): void {
    const state = this.mutableState;
    if (state.phase !== "active") {
      throw new Error("Royal Forkfall can only be used during a wave");
    }
    if (state.abilityChargeTicks < ROYAL_FORKFALL_CHARGE_TICKS) {
      throw new Error("Royal Forkfall is still charging");
    }
    const target = [...state.enemies].sort(
      (left, right) =>
        right.pathDistanceMilli - left.pathDistanceMilli ||
        left.id.localeCompare(right.id),
    )[0];
    if (!target) {
      throw new Error("Royal Forkfall needs an enemy target");
    }

    const healthBefore = target.health;
    this.damageEnemy(target.id, ROYAL_FORKFALL_DAMAGE, "arcane", events);
    const healthAfter =
      state.enemies.find((enemy) => enemy.id === target.id)?.health ?? 0;
    state.abilityChargeTicks = 0;
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
    options: { extend?: boolean } = {},
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
    if (slowImmune || (!options.extend && enemy.slowUntilTick > state.tick)) {
      return false;
    }
    state.enemies[index] = {
      ...enemy,
      slowUntilTick: Math.max(enemy.slowUntilTick, state.tick + ticks),
    };
    return true;
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

      this.spawnEnemyInstance(spawn.enemyId, events);
      state.nextSpawnIndex += 1;
    }
  }

  private spawnEnemyInstance(enemyId: string, events: GameEvent[]): void {
    const state = this.mutableState;
    const definition =
      enemyDefinitions[enemyId as keyof typeof enemyDefinitions];
    if (!definition) {
      throw new Error(`Unknown enemy: ${enemyId}`);
    }

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
    this.enemyCounter += 1;
    const instanceId = `enemy-${this.enemyCounter}`;
    state.enemies.push({
      id: instanceId,
      enemyId,
      health: maxHealth,
      maxHealth,
      pathDistanceMilli: 0,
      slowUntilTick: 0,
      variant: this.random.int(3),
      bossPhase: false,
      wardConsumed: false,
    });
    events.push({
      type: "enemy-spawned",
      enemyId,
      instanceId,
    });
  }

  private spawnEscort(escort: BossEscortDefinition, events: GameEvent[]): void {
    for (let index = 0; index < escort.count; index += 1) {
      this.spawnEnemyInstance(escort.enemyId, events);
    }
  }

  private attackWithTowers(events: GameEvent[]): void {
    const state = this.mutableState;

    for (
      let towerIndex = 0;
      towerIndex < state.towers.length;
      towerIndex += 1
    ) {
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

      const targets = state.enemies
        .filter(
          (enemy) =>
            squaredDistance(pad.position, this.getEnemyPosition(enemy)) <=
            level.range * level.range,
        )
        .sort(
          (left, right) =>
            right.pathDistanceMilli - left.pathDistanceMilli ||
            left.id.localeCompare(right.id),
        );

      const primaryTargets = targets.slice(0, 1 + (level.pierceCount ?? 0));
      const target = primaryTargets[0];
      if (!target) {
        continue;
      }

      const affectedIds = new Set<string>();
      for (const primary of primaryTargets) {
        affectedIds.add(primary.id);
        if (definition.splashRadius > 0) {
          const primaryPosition = this.getEnemyPosition(primary);
          for (const enemy of state.enemies) {
            if (
              squaredDistance(primaryPosition, this.getEnemyPosition(enemy)) <=
              definition.splashRadius * definition.splashRadius
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
      for (const enemy of affected) {
        const healthBefore = enemy.health;
        this.damageEnemy(enemy.id, level.damage, definition.damageType, events);
        const healthAfter =
          state.enemies.find((candidate) => candidate.id === enemy.id)
            ?.health ?? 0;
        damageDealt += healthBefore - healthAfter;
        if (healthAfter === 0) {
          defeatedCount += 1;
        }
        this.applySlow(enemy.id, definition.slowTicks);
      }

      const cooldown = this.cooldownFor(tower, level.cooldownTicks);
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

  private damageEnemy(
    instanceId: string,
    rawDamage: number,
    damageType: "physical" | "arcane" | "sonic",
    events: GameEvent[],
  ): void {
    const state = this.mutableState;
    const index = state.enemies.findIndex((enemy) => enemy.id === instanceId);
    const enemy = state.enemies[index];
    if (!enemy) {
      return;
    }

    const definition = enemyDefinition(enemy.enemyId);

    const hasWard =
      definition.traits?.some((trait) => trait.kind === "first-hit-ward") ??
      false;
    if (hasWard && !enemy.wardConsumed) {
      state.enemies[index] = { ...enemy, wardConsumed: true };
      return;
    }

    const ignoredArmor =
      damageType === "arcane"
        ? Math.ceil(definition.armor / 2)
        : damageType === "sonic"
          ? definition.armor
          : 0;
    const damage = Math.max(1, rawDamage - definition.armor + ignoredArmor);
    let health = Math.max(0, enemy.health - damage);
    let bossPhase = enemy.bossPhase;

    const phaseConfig = definition.bossPhase;
    if (phaseConfig && !bossPhase) {
      const threshold = Math.floor(
        (enemy.maxHealth * phaseConfig.healthThresholdPercent) / 100,
      );
      if (health <= threshold) {
        health = threshold;
        bossPhase = true;
        events.push({ type: "boss-phase", instanceId });
        if (phaseConfig.escort) {
          this.spawnEscort(phaseConfig.escort, events);
        }
      }
    }

    if (health <= 0) {
      if (definition.boss) {
        state.metrics.bossDefeatPathPercent = Math.min(
          100,
          Math.floor(
            (enemy.pathDistanceMilli / this.path.totalDistanceMilli) * 100,
          ),
        );
      }
      state.enemies.splice(index, 1);
      state.gold += definition.reward;
      state.score += definition.maxHealth + definition.reward * 10;
      events.push({
        type: "enemy-defeated",
        instanceId,
        reward: definition.reward,
      });
      return;
    }

    state.enemies[index] = { ...enemy, health, bossPhase };
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
      if (
        supportPad &&
        supportLevel &&
        squaredDistance(towerPad.position, supportPad.position) <=
          supportLevel.range * supportLevel.range
      ) {
        supportPercent = Math.max(
          supportPercent,
          supportDefinition.supportCooldownPercent,
        );
      }
    }

    return Math.max(
      1,
      Math.ceil((baseCooldown * (100 - supportPercent)) / 100),
    );
  }

  private moveEnemies(events: GameEvent[]): void {
    const state = this.mutableState;
    const survivors: EnemyState[] = [];

    for (const enemy of state.enemies) {
      const definition = enemyDefinition(enemy.enemyId);
      const speedPercent =
        enemy.slowUntilTick > state.tick
          ? 100 - towerDefinitions.bardbarian.slowPercent
          : 100;
      const bossPercent = enemy.bossPhase
        ? (definition.bossPhase?.speedMultiplierPercent ?? 100)
        : 100;
      const distance =
        enemy.pathDistanceMilli +
        Math.floor(
          (definition.speed * TICK_MS * speedPercent * bossPercent) / 10_000,
        );

      if (distance >= this.path.totalDistanceMilli) {
        state.lives = Math.max(0, state.lives - definition.lifeDamage);
        state.metrics.leakedEnemies += 1;
        state.metrics.leakedByEnemyId[enemy.enemyId] =
          (state.metrics.leakedByEnemyId[enemy.enemyId] ?? 0) + 1;
        events.push({
          type: "enemy-leaked",
          instanceId: enemy.id,
          damage: definition.lifeDamage,
        });
      } else {
        survivors.push({ ...enemy, pathDistanceMilli: distance });
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
