import { TICK_RATE, type TowerDefinition } from "@srtg/game-core";

function cadence(cooldownTicks: number): string {
  const attacksPerSecond = TICK_RATE / cooldownTicks;
  if (attacksPerSecond >= 1.15) {
    return "fast";
  }
  if (attacksPerSecond >= 0.7) {
    return "steady";
  }
  return "slow";
}

export function towerTacticalDescription(tower: TowerDefinition): string {
  const firstRank = tower.levels[0]!;
  const role =
    tower.supportCooldownPercent > 0
      ? `support splash with ${tower.slowPercent}% slow and ${tower.supportCooldownPercent}% ally haste`
      : tower.splashRadius > 0
        ? `${tower.damageType} splash damage`
        : `${tower.damageType} single-target damage`;
  return `${role}; ${firstRank.range} range, ${cadence(firstRank.cooldownTicks)} cadence; ${tower.cost} gold.`;
}

export function towerChoiceName(tower: TowerDefinition): string {
  return `${tower.name} · ${tower.shortName}`;
}

export function towerUpgradeDescription(
  tower: TowerDefinition,
  currentRank: number,
): string {
  const current = tower.levels[currentRank - 1];
  const next = tower.levels[currentRank];
  if (!current || !next) {
    return "Maximum rank reached.";
  }
  const changes = [
    `${current.damage}→${next.damage} damage`,
    `${current.range}→${next.range} range`,
  ];
  if (next.cooldownTicks < current.cooldownTicks) {
    changes.push(
      `${cadence(current.cooldownTicks)}→${cadence(next.cooldownTicks)} cadence`,
    );
  }
  if (tower.id === "fork-knight" && currentRank + 1 === 4) {
    changes.push("stays focused on one target");
  }
  if (tower.id === "discount-wizard" && currentRank + 1 === 4) {
    const nextSplash = next.splashRadiusOverride;
    if (nextSplash !== undefined) {
      changes.push(
        `splash radius ${current.splashRadiusOverride ?? "base"}→${nextSplash}`,
      );
    }
    if (next.ignoresArmor) {
      changes.push("bypasses armor entirely");
    }
  }
  if (tower.id === "bardbarian" && currentRank + 1 === 4 && next.supportPulse) {
    changes.push(
      `periodic power chord adds +${next.supportPulse.rangeBonus} range every ${next.supportPulse.periodTicks} ticks`,
    );
  }
  return changes.join(", ");
}
