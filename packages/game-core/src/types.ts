import type {
  BattleCheckpoint,
  EquipmentContribution,
  EquipmentProcState,
  GameCommand,
  LoadoutSnapshot,
} from "@srtg/protocol";

import type { EnemyStatusState } from "./status.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const ROYAL_FORKFALL_CHARGE_TICKS = 240;
export const ROYAL_FORKFALL_DAMAGE = 180;
export const EMERGENCY_TEA_BREAK_SLOW_TICKS = TICK_RATE * 4;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TowerSupportPulseDefinition {
  /** How often (in ticks) the pulse recurs. */
  readonly periodTicks: number;
  /** How long (in ticks) each pulse stays active within its period. */
  readonly activeTicks: number;
  /** Extra range granted, while active, to both this rank's own targeting
   * and any nearby tower's support-cooldown check against this tower. */
  readonly rangeBonus: number;
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
  /** Overrides the tower's base `splashRadius` for this rank only. */
  readonly splashRadiusOverride?: number;
  /** When true, this rank's damage ignores the target's armor entirely. */
  readonly ignoresArmor?: boolean;
  /** A deterministic, periodic range boost (e.g. a reward-gated capstone). */
  readonly supportPulse?: TowerSupportPulseDefinition;
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
  | { readonly kind: "first-hit-ward" }
  | { readonly kind: "slow-immune" }
  | {
      /** Multiplies incoming damage of the given type by `percent / 100`
       * before armor is applied. Below 100 is a resistance, above 100 is a
       * vulnerability; author one entry per affected damage type. */
      readonly kind: "damage-resistance";
      readonly damageType: "physical" | "arcane" | "sonic";
      readonly percent: number;
    }
  | {
      /** Grants every *other* enemy within `radius` world units a speed
       * multiplier while this enemy is alive and nearby (recomputed every
       * tick from live positions, so it is deterministic and never stacks
       * beyond the strongest aura touching a given enemy). */
      readonly kind: "speed-aura";
      readonly radius: number;
      readonly speedPercent: number;
    }
  | {
      /** On defeat (not on leak), spawns `count` fresh instances of
       * `intoEnemyId` continuing from the same route/position rather than
       * the route's start. The spawned enemy must not itself declare a
       * `split-on-defeat` trait, keeping the total split count authored
       * and bounded. */
      readonly kind: "split-on-defeat";
      readonly intoEnemyId: string;
      readonly count: number;
    };

export interface BossEscortDefinition {
  readonly enemyId: string;
  readonly count: number;
}

export interface BossPhaseDefinition {
  /** Stable, UI-facing identifier for the stage entered at this threshold. */
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly healthThresholdPercent: number;
  readonly speedMultiplierPercent: number;
  /** Additional armor while this stage is active. */
  readonly armorBonus?: number;
  readonly escort?: BossEscortDefinition;
  /** Stable id emitted and counted when this one-shot reinforcement fires. */
  readonly reinforcementCallId?: string;
  /** When true, entering this phase strips any active first-hit-ward
   * (e.g. an "unwarded final phase"). */
  readonly removesWard?: boolean;
}

export interface BossInitialStageDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly armorBonus?: number;
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
  /** Optional encounter classification for durable threats that are not
   * full campaign bosses and therefore do not receive the boss HUD. */
  readonly encounterRole?: "elite" | "miniboss";
  readonly boss: boolean;
  readonly traits?: readonly EnemyTraitDefinition[];
  /** Metadata and optional one-shot escort for a boss's spawn stage. */
  readonly initialBossStage?: BossInitialStageDefinition;
  /** @deprecated single-phase bosses may still use this; prefer `bossPhases`
   * for multi-phase bosses. When both are set, `bossPhases` wins. */
  readonly bossPhase?: BossPhaseDefinition;
  /** Ordered by descending `healthThresholdPercent`. Each phase triggers
   * (at most once) the first time health drops to/below its threshold. */
  readonly bossPhases?: readonly BossPhaseDefinition[];
}

export interface SpawnDefinition {
  readonly atTick: number;
  readonly enemyId: string;
  /** Which authored route this spawn walks; defaults to the level's first
   * route (or its single `path` on single-route levels) when omitted. */
  readonly routeId?: string;
}

export interface WaveDefinition {
  readonly name: string;
  readonly preview: string;
  readonly spawns: readonly SpawnDefinition[];
  /** The first defeated non-boss in this wave returns once at this health. */
  readonly referral?: {
    readonly reviveHealthPercent: number;
  };
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
  /** When set, these tower ids may never be placed on this pad even if not
   * restricted by `allowedTowerIds` (e.g. thin ice rejecting heavy melee). */
  readonly deniedTowerIds?: readonly string[];
  /** Deterministic per-wave windows (elapsed ticks since wave start) during
   * which any tower on this pad stops firing and the pad cannot be built on. */
  readonly shutdowns?: readonly PadShutdownDefinition[];
  /** Which authored route this pad primarily covers, or "shared" for a pad
   * positioned to cover more than one route (e.g. a merge point). Purely
   * descriptive metadata for telegraphing and UI grouping. */
  readonly laneId?: string;
  /** Groups pads that are telegraphed/authored together (e.g. a cluster of
   * contested pads that all shut down on the same schedule). Purely
   * descriptive metadata for telegraphing and UI grouping. */
  readonly clusterId?: string;
}

export type MasteryRule =
  | { readonly kind: "no-leaks" }
  | { readonly kind: "no-leaks-of"; readonly enemyId: string }
  | { readonly kind: "no-leaks-in-wave"; readonly waveIndex: number }
  | { readonly kind: "max-spent-gold"; readonly maxGold: number }
  | { readonly kind: "max-towers-placed"; readonly maxTowers: number }
  | { readonly kind: "max-tower-types"; readonly maxTypes: number }
  | { readonly kind: "use-all-tower-types" }
  | { readonly kind: "no-tower-sold" }
  | { readonly kind: "min-final-gold"; readonly minGold: number }
  | { readonly kind: "victory-under-modifier"; readonly modifierId: string }
  | { readonly kind: "no-ability-used"; readonly abilityId: string }
  | { readonly kind: "max-split-spawns"; readonly maxSplits: number }
  | { readonly kind: "no-leaks-during-environment-hazards" }
  | { readonly kind: "no-exposed-pad-uses" }
  | { readonly kind: "no-referred-enemy-reaches-halfway" }
  | {
      /** True when no instance of `enemyId` leaked and the last one was
       * defeated by half of the final victorious tick count. */
      readonly kind: "enemy-cleared-before-half-battle";
      readonly enemyId: string;
    }
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

export interface ModifierUnlockRewardDefinition {
  readonly kind: "modifier-unlock";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modifierId: string;
}

export interface CosmeticRewardDefinition {
  readonly kind: "cosmetic";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cosmeticType: "crest" | "palette";
}

export interface CampaignRewardDefinition {
  readonly kind: "campaign";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly featureId: "epilogue";
}

export type RewardDefinition =
  | TowerRankRewardDefinition
  | AbilityRewardDefinition
  | ModifierUnlockRewardDefinition
  | CosmeticRewardDefinition
  | CampaignRewardDefinition;

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

export interface RouteDefinition {
  readonly id: string;
  readonly path: readonly Point[];
}

export interface SpeedZoneDefinition {
  readonly id?: string;
  readonly routeId: string;
  /** Percent (0-100) of that route's total length where the zone begins. */
  readonly fromPercent: number;
  /** Percent (0-100) of that route's total length where the zone ends. */
  readonly toPercent: number;
  /** Speed multiplier applied while inside the zone (100 = unchanged). */
  readonly speedPercent: number;
  /** When set, this zone only applies while that hazard is active. */
  readonly activationHazardId?: string;
}

export interface EnvironmentHazardDefinition {
  readonly id: string;
  readonly kind: "eruption";
  readonly name: string;
  readonly description: string;
  readonly waveIndex: number;
  readonly telegraphFromTick: number;
  readonly activeFromTick: number;
  readonly activeToTick: number;
  readonly exposedPadIds: readonly string[];
  readonly speedZoneIds: readonly string[];
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly act: 1 | 2 | 3;
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
  /** The primary/default route; equals `routes[0].path` when `routes` is
   * set. Single-route levels only need to author this field. */
  readonly path: readonly Point[];
  /** When set (length >= 2), the full list of authored entry routes that
   * converge toward the same defended goal. Enemy spawns pick a route via
   * `SpawnDefinition.routeId` (defaulting to `routes[0].id`). */
  readonly routes?: readonly RouteDefinition[];
  /** Deterministic marked segments (e.g. thin ice) that change enemy speed
   * along a specific route. */
  readonly speedZones?: readonly SpeedZoneDefinition[];
  /** Authored, deterministic per-wave environment timelines. */
  readonly environmentHazards?: readonly EnvironmentHazardDefinition[];
  readonly pads: readonly TowerPadDefinition[];
  readonly waves: readonly WaveDefinition[];
  readonly mastery: readonly MasteryDefinition[];
  readonly availableModifierIds: readonly string[];
  readonly rewardIds: readonly string[];
}

export interface FullBossEncounterDefinition {
  readonly levelId: string;
  readonly enemyId: string;
  readonly cadence: "regular" | "act-finale-exception";
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
  readonly act: 1 | 2 | 3;
  readonly order: number;
  /** @deprecated retained for legacy consumers; see `unlockConditions`. */
  readonly unlock: "start" | "victory" | "modifier";
  /** @deprecated retained for legacy consumers; see `unlockConditions`. */
  readonly unlockSourceId: string | null;
  /** Any satisfied condition unlocks the node (logical OR). An empty array
   * means the node can never unlock through normal play (e.g. an honest
   * "coming later" placeholder for a not-yet-built act). */
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
  /** Which authored route this enemy instance is walking. */
  readonly routeId: string;
  /** True once at least one boss phase has triggered. */
  readonly bossPhase: boolean;
  /** Count of boss phases already triggered, in authored order. */
  readonly bossPhaseIndex: number;
  /** Whether a "first-hit-ward" trait (e.g. Coupon Squire) has already been consumed. */
  readonly wardConsumed: boolean;
  /** Referral revival state. Referred enemies can never revive recursively. */
  readonly referred: boolean;
  readonly spectral: boolean;
  readonly referredReachedHalfway: boolean;
  /** Stable UI stage id, including the initial boss stage when authored. */
  readonly activeBossStageId: string | null;
  /** Equipment control state; absent only in pre-v4 test fixtures. */
  readonly status?: EnemyStatusState;
}

export interface BattleMetrics {
  readonly spentGold: number;
  /** Authored prices before equipment discounts, used by budget masteries. */
  readonly authoredSpentGold: number;
  readonly leakedEnemies: number;
  readonly leakedByEnemyId: Readonly<Record<string, number>>;
  /** Leaked enemy count keyed by wave index (as a string), for masteries
   * that require a clean specific wave (e.g. the boss wave). */
  readonly leakedByWaveIndex: Readonly<Record<string, number>>;
  readonly soldTowers: number;
  readonly usedTowerIds: readonly string[];
  /** Total placements made; selling does not reduce this mastery metric. */
  readonly maxTowersPlaced: number;
  /** Percent (0-100) of the path a boss had covered when defeated, or null if none was defeated. */
  readonly bossDefeatPathPercent: number | null;
  /** Total enemies spawned by a "split-on-defeat" trait this battle. */
  readonly splitSpawns: number;
  /** Cumulative activations of each ability id this battle. */
  readonly abilityActivations: Readonly<Record<string, number>>;
  /** For each enemy id that has been defeated at least once, the tick of
   * its most recent defeat (overwritten on every subsequent defeat, so once
   * every spawned instance is gone it holds the tick of the last one). */
  readonly lastEnemyClearedTick: Readonly<Record<string, number>>;
  readonly leaksDuringEnvironmentHazards: number;
  readonly exposedPadUses: number;
  readonly referredEnemiesReachedHalfway: number;
  readonly referredWaveIndices: readonly number[];
  readonly bossReinforcementCalls: Readonly<Record<string, number>>;
  readonly defeatedBossEnemyIds: readonly string[];
  readonly equipment: Readonly<Record<string, EquipmentContribution>>;
}

export type BattlePhase = "preparing" | "active" | "victory" | "defeat";

export interface GameState {
  readonly levelId: string;
  readonly attemptId: string;
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly loadoutSnapshot: LoadoutSnapshot;
  readonly rngState: {
    readonly spawn: number;
    readonly combat: number;
  };
  readonly equipmentProcState: EquipmentProcState;
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
  readonly telegraphedEnvironmentHazardIds: readonly string[];
  readonly activeEnvironmentHazardIds: readonly string[];
  readonly exposedPadIds: readonly string[];
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
      readonly damageDealt: number;
      readonly defeatedCount: number;
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
      readonly stageId?: string;
      readonly stageName?: string;
      readonly reinforcementCallId?: string;
    }
  | {
      readonly type: "environment-hazard-telegraphed";
      readonly hazardId: string;
    }
  | {
      readonly type: "environment-hazard-started";
      readonly hazardId: string;
      readonly exposedPadIds: readonly string[];
    }
  | {
      readonly type: "environment-hazard-ended";
      readonly hazardId: string;
    }
  | {
      readonly type: "enemy-referred";
      readonly originalInstanceId: string;
      readonly referredInstanceId: string;
      readonly health: number;
    }
  | {
      readonly type: "referred-enemy-reached-halfway";
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
    }
  | {
      readonly type: "equipment-effect";
      readonly itemId: string;
      readonly effectId: string;
      readonly sourceInstanceId: string;
      readonly targetInstanceId: string | null;
      readonly outcome: "applied" | "converted" | "immune" | "rejected";
      readonly message: string;
    };

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface SimulationOptions {
  readonly levelId?: string;
  readonly attemptId?: string;
  readonly seed?: number;
  readonly modifierIds?: readonly string[];
  readonly checkpoint?: BattleCheckpoint;
  readonly loadoutSnapshot?: LoadoutSnapshot;
  /** Optional starting/current gold floor for an explicitly controlled test run. */
  readonly goldFloor?: number | undefined;
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
