import {
  CONTENT_VERSION,
  type BattleCheckpoint,
  type GameCommand,
} from "@srtg/protocol";

import {
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  towerDefinitions,
} from "./content.js";
import { pointAlongPath, preparePath } from "./path.js";
import { SeededRandom } from "./rng.js";
import {
  TICK_MS,
  type EnemyState,
  type GameEvent,
  type GameState,
  type Point,
  type Simulation,
  type SimulationOptions,
  type StepResult,
  type TowerState,
} from "./types.js";
import { validateCheckpointContent } from "./validation.js";

interface MutableMetrics {
  spentGold: number;
  leakedEnemies: number;
  soldTowers: number;
  usedTowerIds: string[];
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

function deepState(state: MutableState): GameState {
  return {
    ...state,
    modifierIds: [...state.modifierIds],
    towers: state.towers.map((tower) => ({ ...tower })),
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    metrics: {
      ...state.metrics,
      usedTowerIds: [...state.metrics.usedTowerIds],
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
      towers:
        checkpoint?.placements.map((placement) => ({
          id: placement.id,
          towerId: placement.towerId,
          padId: placement.padId,
          level: placement.level,
          nextAttackTick: checkpoint.tick,
          investedGold: this.investedGold(placement.towerId, placement.level),
        })) ?? [],
      enemies: [],
      metrics: checkpoint
        ? {
            spentGold: checkpoint.metrics.spentGold,
            leakedEnemies: checkpoint.metrics.leakedEnemies,
            soldTowers: checkpoint.metrics.soldTowers,
            usedTowerIds: [...checkpoint.metrics.usedTowerIds],
          }
        : {
            spentGold: 0,
            leakedEnemies: 0,
            soldTowers: 0,
            usedTowerIds: [],
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
        soldTowers: state.metrics.soldTowers,
        usedTowerIds: [...state.metrics.usedTowerIds],
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
        tick: state.tick,
        phase: state.phase,
        waveIndex: state.waveIndex,
        lives: state.lives,
        gold: state.gold,
        score: state.score,
        towers: state.towers,
        enemies: state.enemies,
        metrics: state.metrics,
        completedMasteryIds: state.completedMasteryIds,
      }),
    );
  }

  private placeTower(towerId: string, padId: string): void {
    this.requirePreparing();
    const definition = Object.hasOwn(towerDefinitions, towerId)
      ? towerDefinitions[towerId as keyof typeof towerDefinitions]
      : undefined;
    if (!definition) {
      throw new Error(`Unknown tower: ${towerId}`);
    }
    if (!this.level.pads.some((pad) => pad.id === padId)) {
      throw new Error(`Unknown tower pad: ${padId}`);
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
  }

  private upgradeTower(instanceId: string): void {
    this.requirePreparing();
    const index = this.mutableState.towers.findIndex(
      (tower) => tower.id === instanceId,
    );
    const tower = this.mutableState.towers[index];
    if (!tower) {
      throw new Error(`Unknown tower instance: ${instanceId}`);
    }

    const definition =
      towerDefinitions[tower.towerId as keyof typeof towerDefinitions];
    const level = definition.levels[tower.level - 1];
    if (!level || level.upgradeCost === null) {
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
  }

  private requirePreparing(): void {
    if (this.mutableState.phase !== "preparing") {
      throw new Error("Towers can only be managed between waves");
    }
  }

  private tick(events: GameEvent[]): void {
    const state = this.mutableState;
    state.tick += 1;
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
    while (state.nextSpawnIndex < wave.spawns.length) {
      const spawn = wave.spawns[state.nextSpawnIndex];
      if (!spawn || spawn.atTick > elapsed) {
        break;
      }

      const definition =
        enemyDefinitions[spawn.enemyId as keyof typeof enemyDefinitions];
      if (!definition) {
        throw new Error(`Unknown enemy: ${spawn.enemyId}`);
      }

      const healthPercent = state.modifierIds.reduce(
        (percent, modifierId) =>
          Math.floor(
            (percent *
              modifierDefinitions[
                modifierId as keyof typeof modifierDefinitions
              ].enemyHealthPercent) /
              100,
          ),
        100,
      );
      const maxHealth = Math.ceil((definition.maxHealth * healthPercent) / 100);
      this.enemyCounter += 1;
      const instanceId = `enemy-${this.enemyCounter}`;
      state.enemies.push({
        id: instanceId,
        enemyId: spawn.enemyId,
        health: maxHealth,
        maxHealth,
        pathDistanceMilli: 0,
        slowUntilTick: 0,
        variant: this.random.int(3),
        bossPhase: false,
      });
      state.nextSpawnIndex += 1;
      events.push({
        type: "enemy-spawned",
        enemyId: spawn.enemyId,
        instanceId,
      });
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

      const definition =
        towerDefinitions[tower.towerId as keyof typeof towerDefinitions];
      const level = definition.levels[tower.level - 1];
      const pad = this.level.pads.find(
        (candidate) => candidate.id === tower.padId,
      );
      if (!level || !pad) {
        throw new Error(`Invalid tower state: ${tower.id}`);
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
      const target = targets[0];
      if (!target) {
        continue;
      }

      const targetPosition = this.getEnemyPosition(target);
      const affected = state.enemies
        .filter(
          (enemy) =>
            enemy.id === target.id ||
            (definition.splashRadius > 0 &&
              squaredDistance(targetPosition, this.getEnemyPosition(enemy)) <=
                definition.splashRadius * definition.splashRadius),
        )
        .sort((left, right) => left.id.localeCompare(right.id));

      for (const enemy of affected) {
        this.damageEnemy(enemy.id, level.damage, definition.damageType, events);
        const current = state.enemies.find(
          (candidate) => candidate.id === enemy.id,
        );
        if (current && definition.slowTicks > 0) {
          const slowed: EnemyState = {
            ...current,
            slowUntilTick: Math.max(
              current.slowUntilTick,
              state.tick + definition.slowTicks,
            ),
          };
          state.enemies[state.enemies.indexOf(current)] = slowed;
        }
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

    const definition =
      enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
    const ignoredArmor =
      damageType === "arcane"
        ? Math.ceil(definition.armor / 2)
        : damageType === "sonic"
          ? definition.armor
          : 0;
    const damage = Math.max(1, rawDamage - definition.armor + ignoredArmor);
    const health = Math.max(0, enemy.health - damage);
    let bossPhase = enemy.bossPhase;

    if (
      definition.boss &&
      !bossPhase &&
      health > 0 &&
      health <= Math.floor(enemy.maxHealth / 2)
    ) {
      bossPhase = true;
      events.push({ type: "boss-phase", instanceId });
    }

    if (health <= 0) {
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
      const definition =
        enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
      const speedPercent =
        enemy.slowUntilTick > state.tick
          ? 100 - towerDefinitions.bardbarian.slowPercent
          : 100;
      const bossPercent = enemy.bossPhase ? 155 : 100;
      const distance =
        enemy.pathDistanceMilli +
        Math.floor(
          (definition.speed * TICK_MS * speedPercent * bossPercent) / 10_000,
        );

      if (distance >= this.path.totalDistanceMilli) {
        state.lives = Math.max(0, state.lives - definition.lifeDamage);
        state.metrics.leakedEnemies += 1;
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
    const completed: string[] = [];

    if (state.metrics.leakedEnemies === 0) {
      completed.push("dry-socks");
    }
    if (
      Object.keys(towerDefinitions).every((towerId) =>
        state.metrics.usedTowerIds.includes(towerId),
      )
    ) {
      completed.push("balanced-party");
    }
    if (state.metrics.spentGold <= 620) {
      completed.push("royal-accounting");
    }

    return completed;
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
