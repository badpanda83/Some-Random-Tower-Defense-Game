import type { BattleMetrics, MasteryRule } from "./types.js";

export interface MasteryContext {
  readonly metrics: BattleMetrics;
  readonly modifierIds: readonly string[];
  readonly finalGold: number;
  readonly totalTowerTypeCount: number;
  /** The tick count at the moment the battle was won (i.e. the current
   * `GameState.tick`), used by rules that reason about elapsed proportion. */
  readonly finalTick: number;
}

function assertNeverRule(rule: never): never {
  throw new Error(`Unsupported mastery rule: ${JSON.stringify(rule)}`);
}

/**
 * Evaluates a single typed mastery rule against a completed battle's
 * metrics/context. Pure and side-effect free so it can be unit tested
 * directly without running a full simulation.
 */
export function evaluateMasteryRule(
  rule: MasteryRule,
  context: MasteryContext,
): boolean {
  switch (rule.kind) {
    case "no-leaks":
      return context.metrics.leakedEnemies === 0;
    case "no-leaks-of":
      return (context.metrics.leakedByEnemyId[rule.enemyId] ?? 0) === 0;
    case "no-leaks-in-wave":
      return (
        (context.metrics.leakedByWaveIndex[String(rule.waveIndex)] ?? 0) === 0
      );
    case "max-spent-gold":
      return context.metrics.authoredSpentGold <= rule.maxGold;
    case "max-towers-placed":
      return context.metrics.maxTowersPlaced <= rule.maxTowers;
    case "max-tower-types":
      return context.metrics.usedTowerIds.length <= rule.maxTypes;
    case "use-all-tower-types":
      return context.metrics.usedTowerIds.length >= context.totalTowerTypeCount;
    case "no-tower-sold":
      return context.metrics.soldTowers === 0;
    case "min-final-gold":
      return context.finalGold >= rule.minGold;
    case "victory-under-modifier":
      return context.modifierIds.includes(rule.modifierId);
    case "no-ability-used":
      return (context.metrics.abilityActivations[rule.abilityId] ?? 0) === 0;
    case "max-split-spawns":
      return context.metrics.splitSpawns <= rule.maxSplits;
    case "no-leaks-during-environment-hazards":
      return context.metrics.leaksDuringEnvironmentHazards === 0;
    case "no-exposed-pad-uses":
      return context.metrics.exposedPadUses === 0;
    case "no-referred-enemy-reaches-halfway":
      return context.metrics.referredEnemiesReachedHalfway === 0;
    case "enemy-cleared-before-half-battle": {
      const clearedAtTick = context.metrics.lastEnemyClearedTick[rule.enemyId];
      return (
        (context.metrics.leakedByEnemyId[rule.enemyId] ?? 0) === 0 &&
        clearedAtTick !== undefined &&
        clearedAtTick <= context.finalTick / 2
      );
    }
    case "boss-defeated-before-path-percent":
      return (
        context.metrics.bossDefeatPathPercent !== null &&
        context.metrics.bossDefeatPathPercent < rule.maxPercent
      );
    default:
      return assertNeverRule(rule);
  }
}
