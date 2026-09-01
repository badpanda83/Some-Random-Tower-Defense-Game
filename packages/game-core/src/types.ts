import type { BattleCheckpoint, GameCommand } from "@srtg/protocol";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TowerLevelDefinition {
  readonly damage: number;
  readonly range: number;
  readonly cooldownTicks: number;
  readonly upgradeCost: number | null;
}

export interface TowerDefinition {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly color: number;
  readonly cost: number;
  readonly damageType: "physical" | "arcane" | "sonic";
  readonly splashRadius: number;
  readonly slowPercent: number;
  readonly slowTicks: number;
  readonly supportCooldownPercent: number;
  readonly levels: readonly TowerLevelDefinition[];
}

export interface EnemyDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly color: number;
  readonly maxHealth: number;
  readonly speed: number;
  readonly armor: number;
  readonly reward: number;
  readonly lifeDamage: number;
  readonly boss: boolean;
}

export interface SpawnDefinition {
  readonly atTick: number;
  readonly enemyId: string;
}

export interface WaveDefinition {
  readonly name: string;
  readonly preview: string;
  readonly spawns: readonly SpawnDefinition[];
}

export interface TowerPadDefinition {
  readonly id: string;
  readonly position: Point;
}

export interface MasteryDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface ModifierDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startingGoldDelta: number;
  readonly enemyHealthPercent: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly width: number;
  readonly height: number;
  readonly startingLives: number;
  readonly startingGold: number;
  readonly path: readonly Point[];
  readonly pads: readonly TowerPadDefinition[];
  readonly waves: readonly WaveDefinition[];
  readonly mastery: readonly MasteryDefinition[];
  readonly availableModifierIds: readonly string[];
}

export interface CampaignNodeDefinition {
  readonly id: string;
  readonly levelId: string | null;
  readonly name: string;
  readonly description: string;
  readonly position: Point;
  readonly unlock: "start" | "victory" | "modifier";
  readonly unlockSourceId: string | null;
}

export interface TowerState {
  readonly id: string;
  readonly towerId: string;
  readonly padId: string;
  readonly level: number;
  readonly nextAttackTick: number;
  readonly investedGold: number;
}

export interface EnemyState {
  readonly id: string;
  readonly enemyId: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly pathDistanceMilli: number;
  readonly slowUntilTick: number;
  readonly variant: number;
  readonly bossPhase: boolean;
}

export interface BattleMetrics {
  readonly spentGold: number;
  readonly leakedEnemies: number;
  readonly soldTowers: number;
  readonly usedTowerIds: readonly string[];
}

export type BattlePhase = "preparing" | "active" | "victory" | "defeat";

export interface GameState {
  readonly levelId: string;
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly tick: number;
  readonly phase: BattlePhase;
  readonly waveIndex: number;
  readonly waveStartedAtTick: number | null;
  readonly nextSpawnIndex: number;
  readonly lives: number;
  readonly gold: number;
  readonly score: number;
  readonly towers: readonly TowerState[];
  readonly enemies: readonly EnemyState[];
  readonly metrics: BattleMetrics;
  readonly completedMasteryIds: readonly string[];
}

export type GameEvent =
  | {
      readonly type: "enemy-spawned";
      readonly enemyId: string;
      readonly instanceId: string;
    }
  | {
      readonly type: "tower-attacked";
      readonly towerId: string;
      readonly towerInstanceId: string;
      readonly targetInstanceId: string;
      readonly affectedInstanceIds: readonly string[];
    }
  | {
      readonly type: "enemy-defeated";
      readonly instanceId: string;
      readonly reward: number;
    }
  | {
      readonly type: "enemy-leaked";
      readonly instanceId: string;
      readonly damage: number;
    }
  | {
      readonly type: "boss-phase";
      readonly instanceId: string;
    }
  | {
      readonly type: "wave-complete";
      readonly waveIndex: number;
    }
  | {
      readonly type: "battle-complete";
      readonly result: "victory" | "defeat";
      readonly completedMasteryIds: readonly string[];
    };

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface SimulationOptions {
  readonly levelId?: string;
  readonly seed?: number;
  readonly modifierIds?: readonly string[];
  readonly checkpoint?: BattleCheckpoint;
}

export interface Simulation {
  readonly state: GameState;
  dispatch(command: GameCommand): StepResult;
  step(ticks?: number): StepResult;
  getEnemyPosition(enemy: EnemyState): Point;
  createCheckpoint(): BattleCheckpoint | null;
  stateHash(): string;
}
