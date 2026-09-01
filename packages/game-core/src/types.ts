import type { BattleCheckpoint, GameCommand } from "@srtg/protocol";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const ROYAL_FORKFALL_CHARGE_TICKS = 240;
export const ROYAL_FORKFALL_DAMAGE = 180;
export const EMERGENCY_TEA_BREAK_SLOW_TICKS = TICK_RATE * 4;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TowerLevelDefinition {
  readonly damage: number;
  readonly range: number;
  readonly cooldownTicks: number;
  readonly upgradeCost: number | null;
  /**
   * Extra distinct enemies (beyond the primary target) this rank's attack
   * also strikes for full damage, chosen from enemies already in range and
   * sorted the same way as targeting. Undefined/0 means no pierce.
   */
  readonly pierceCount?: number;
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
  /**
   * The highest rank available to a fresh campaign, before any reward-gated
   * ranks (see `RewardDefinition` of kind "tower-rank") are unlocked. Always
   * less than or equal to `levels.length`.
   */
  readonly baseMaxLevel: number;
  readonly levels: readonly TowerLevelDefinition[];
}

export type EnemyTraitDefinition =
  { readonly kind: "first-hit-ward" } | { readonly kind: "slow-immune" };

export interface BossEscortDefinition {
  readonly enemyId: string;
  readonly count: number;
}

export interface BossPhaseDefinition {
  readonly healthThresholdPercent: number;
  readonly speedMultiplierPercent: number;
  readonly escort?: BossEscortDefinition;
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
  readonly traits?: readonly EnemyTraitDefinition[];
  readonly bossPhase?: BossPhaseDefinition;
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

export interface PadShutdownDefinition {
  readonly waveIndex: number;
  readonly fromTick: number;
  readonly toTick: number;
}

export interface TowerPadDefinition {
  readonly id: string;
  readonly position: Point;
  /** When set, only these tower ids may be placed on this pad. */
  readonly allowedTowerIds?: readonly string[];
  /** Deterministic per-wave windows (elapsed ticks since wave start) during
   * which any tower on this pad stops firing and the pad cannot be built on. */
  readonly shutdowns?: readonly PadShutdownDefinition[];
}

export type MasteryRule =
  | { readonly kind: "no-leaks" }
  | { readonly kind: "no-leaks-of"; readonly enemyId: string }
  | { readonly kind: "max-spent-gold"; readonly maxGold: number }
  | { readonly kind: "max-towers-placed"; readonly maxTowers: number }
  | { readonly kind: "max-tower-types"; readonly maxTypes: number }
  | { readonly kind: "use-all-tower-types" }
  | { readonly kind: "no-tower-sold" }
  | { readonly kind: "min-final-gold"; readonly minGold: number }
  | { readonly kind: "victory-under-modifier"; readonly modifierId: string }
  | {
      readonly kind: "boss-defeated-before-path-percent";
      readonly maxPercent: number;
    };

export interface MasteryDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rule: MasteryRule;
}

export interface ModifierDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startingGoldDelta: number;
  readonly enemyHealthPercent: number;
  /** Spawn-timeline multiplier (100 = authored timing; lower is faster). */
  readonly spawnIntervalPercent: number;
  /** Extends any pad shutdown windows on the level by this many ticks. */
  readonly padShutdownExtraTicks: number;
}

export interface TowerRankRewardDefinition {
  readonly kind: "tower-rank";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly towerId: string;
  readonly unlockedLevel: number;
}

export interface AbilityRewardDefinition {
  readonly kind: "ability";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly abilityId: string;
}

export type RewardDefinition =
  TowerRankRewardDefinition | AbilityRewardDefinition;

export interface LevelPaletteDefinition {
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
}

export interface LevelEnvironmentDefinition {
  readonly theme: string;
  readonly decorIds: readonly string[];
  readonly palette: LevelPaletteDefinition;
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly act: 1;
  readonly order: number;
  /**
   * First-play duration estimate in minutes for web display. This models a
   * typical first-clear (between-wave planning, reading previews, and
   * learning the level's mechanic) rather than pure headless tick time,
   * which is much shorter for a deterministic engine replay.
   */
  readonly estimatedMinutes: number;
  readonly threatSummary: string;
  readonly mechanicSummary: string;
  readonly environment: LevelEnvironmentDefinition;
  readonly width: number;
  readonly height: number;
  readonly startingLives: number;
  readonly startingGold: number;
  readonly path: readonly Point[];
  readonly pads: readonly TowerPadDefinition[];
  readonly waves: readonly WaveDefinition[];
  readonly mastery: readonly MasteryDefinition[];
  readonly availableModifierIds: readonly string[];
  readonly rewardIds: readonly string[];
}

export type CampaignUnlockCondition =
  | { readonly kind: "start" }
  | { readonly kind: "victory"; readonly levelId: string }
  | { readonly kind: "legacy-modifier"; readonly modifierId: string };

export interface CampaignNodeDefinition {
  readonly id: string;
  readonly levelId: string | null;
  readonly name: string;
  readonly description: string;
  readonly position: Point;
  readonly act: 1;
  readonly order: number;
  /** @deprecated retained for legacy consumers; see `unlockConditions`. */
  readonly unlock: "start" | "victory" | "modifier";
  /** @deprecated retained for legacy consumers; see `unlockConditions`. */
  readonly unlockSourceId: string | null;
  /** Any satisfied condition unlocks the node (logical OR). */
  readonly unlockConditions: readonly CampaignUnlockCondition[];
  readonly rewardIds: readonly string[];
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
  /** Whether a "first-hit-ward" trait (e.g. Coupon Squire) has already been consumed. */
  readonly wardConsumed: boolean;
}

export interface BattleMetrics {
  readonly spentGold: number;
  readonly leakedEnemies: number;
  readonly leakedByEnemyId: Readonly<Record<string, number>>;
  readonly soldTowers: number;
  readonly usedTowerIds: readonly string[];
  /** Total placements made; selling does not reduce this mastery metric. */
  readonly maxTowersPlaced: number;
  /** Percent (0-100) of the path a boss had covered when defeated, or null if none was defeated. */
  readonly bossDefeatPathPercent: number | null;
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
  readonly abilityChargeTicks: number;
  readonly teaBreakUsedThisWave: boolean;
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
      readonly type: "ability-activated";
      readonly targetInstanceId: string;
      readonly damageDealt: number;
    }
  | {
      readonly type: "tea-break-activated";
      readonly affectedInstanceIds: readonly string[];
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
  /** Reward ids (see `RewardDefinition`) unlocked for this run, e.g. from campaign progress. */
  readonly unlockedRewardIds?: readonly string[];
}

export interface Simulation {
  readonly state: GameState;
  dispatch(command: GameCommand): StepResult;
  step(ticks?: number): StepResult;
  getEnemyPosition(enemy: EnemyState): Point;
  getTowerMaxLevel(towerId: string): number;
  createCheckpoint(): BattleCheckpoint | null;
  stateHash(): string;
}
