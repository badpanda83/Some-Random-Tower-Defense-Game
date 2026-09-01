import type { BattleMetrics, MasteryRule } from "./types.js";

export interface MasteryContext {
  readonly metrics: BattleMetrics;
  readonly modifierIds: readonly string[];
  readonly finalGold: number;
  readonly totalTowerTypeCount: number;
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
    case "max-spent-gold":
      return context.metrics.spentGold <= rule.maxGold;
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
    case "boss-defeated-before-path-percent":
      return (
        context.metrics.bossDefeatPathPercent !== null &&
        context.metrics.bossDefeatPathPercent < rule.maxPercent
      );
    default:
      return assertNeverRule(rule);
  }
}
