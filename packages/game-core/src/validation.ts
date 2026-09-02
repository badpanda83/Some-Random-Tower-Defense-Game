import type { BattleCheckpoint, SaveData } from "@srtg/protocol";

import {
  campaignNodes,
  enemyDefinitions,
  fullBossEncounterDefinitions,
  levelDefinitions,
  modifierDefinitions,
  towerDefinitions,
} from "./content.js";
import {
  DAMAGE_PROC_DPS_CAP_PERCENT,
  equipmentDefinitions,
  FULL_LOADOUT_OUTPUT_CAP_PERCENT,
  RANDOM_CONTROL_MIN_COOLDOWN_TICKS,
  validateLoadoutSnapshot,
} from "./equipment.js";

export function validateRpgFoundationContent(): readonly string[] {
  const errors: string[] = [];
  const orderedLevels = campaignNodes
    .filter((node) => node.levelId)
    .sort((left, right) => left.order - right.order)
    .map((node) => node.levelId);
  if (
    orderedLevels.length !== 10 ||
    new Set(orderedLevels).size !== orderedLevels.length
  ) {
    errors.push("Campaign must contain exactly ten unique playable missions");
  }

  for (const encounter of fullBossEncounterDefinitions) {
    const level =
      levelDefinitions[encounter.levelId as keyof typeof levelDefinitions];
    const enemy =
      enemyDefinitions[encounter.enemyId as keyof typeof enemyDefinitions];
    if (!level || !enemy?.boss) {
      errors.push(
        `Invalid full boss encounter: ${encounter.levelId}/${encounter.enemyId}`,
      );
      continue;
    }
    if (
      !level.waves.some((wave) =>
        wave.spawns.some((spawn) => spawn.enemyId === encounter.enemyId),
      )
    ) {
      errors.push(
        `Full boss ${encounter.enemyId} is not spawned by ${encounter.levelId}`,
      );
    }
  }

  const dragonIntern = enemyDefinitions["dragon-intern"];
  if (
    dragonIntern.boss ||
    dragonIntern.encounterRole !== "miniboss" ||
    !["muddy-moat", "quarterly-dragon-review"].every((levelId) =>
      levelDefinitions[levelId as keyof typeof levelDefinitions].waves.some(
        (wave) =>
          wave.spawns.some((spawn) => spawn.enemyId === "dragon-intern"),
      ),
    )
  ) {
    errors.push("Dragon Intern must remain a miniboss in missions 1 and 10");
  }

  const effectIds = new Set<string>();
  for (const [itemId, item] of Object.entries(equipmentDefinitions)) {
    if (item.id !== itemId) {
      errors.push(`Equipment key/id mismatch: ${itemId}`);
    }
    if (item.horizontalBudgetPercent > FULL_LOADOUT_OUTPUT_CAP_PERCENT) {
      errors.push(`Equipment exceeds horizontal budget: ${itemId}`);
    }
    for (const effect of item.effects) {
      if (effectIds.has(effect.id)) {
        errors.push(`Duplicate equipment effect id: ${effect.id}`);
      }
      effectIds.add(effect.id);
      if (
        effect.kind === "primary-proc" &&
        effect.cooldownTicks < RANDOM_CONTROL_MIN_COOLDOWN_TICKS
      ) {
        errors.push(`Random control cooldown is too short: ${effect.id}`);
      }
      if (
        effect.kind === "primary-proc" &&
        effect.boss.kind === "bonus-damage" &&
        item.horizontalBudgetPercent < DAMAGE_PROC_DPS_CAP_PERCENT
      ) {
        errors.push(`Damage proc budget is invalid: ${effect.id}`);
      }
      if (
        effect.kind === "secondary-target" &&
        (effect.damagePercentRankFour !== 35 ||
          effect.damagePercentRanksOneToThree !== 60 ||
          effect.canProc)
      ) {
        errors.push("Fork secondary-target contract changed");
      }
    }
  }
  return errors;
}

export function validateCheckpointContent(
  checkpoint: BattleCheckpoint,
): readonly string[] {
  const errors: string[] = [];
  const level = Object.hasOwn(levelDefinitions, checkpoint.levelId)
    ? levelDefinitions[checkpoint.levelId as keyof typeof levelDefinitions]
    : undefined;
  if (!level) {
    return [`Unknown checkpoint level: ${checkpoint.levelId}`];
  }
  if (checkpoint.nextWave >= level.waves.length) {
    errors.push("Checkpoint wave is outside the playable level");
  }

  const instanceIds = new Set<string>();
  const padIds = new Set<string>();
  for (const placement of checkpoint.placements) {
    const tower = Object.hasOwn(towerDefinitions, placement.towerId)
      ? towerDefinitions[placement.towerId as keyof typeof towerDefinitions]
      : undefined;
    if (!tower) {
      errors.push(`Unknown checkpoint tower: ${placement.towerId}`);
    } else if (placement.level > tower.levels.length) {
      errors.push(`Invalid rank for checkpoint tower: ${placement.towerId}`);
    }
    const pad = level.pads.find(
      (candidate) => candidate.id === placement.padId,
    );
    if (!pad) {
      errors.push(`Unknown checkpoint pad: ${placement.padId}`);
    } else if (
      tower &&
      pad.allowedTowerIds &&
      !pad.allowedTowerIds.includes(tower.id)
    ) {
      errors.push(
        `Checkpoint tower ${tower.id} is not allowed on pad: ${placement.padId}`,
      );
    } else if (tower && pad.deniedTowerIds?.includes(tower.id)) {
      errors.push(
        `Checkpoint tower ${tower.id} is denied on pad: ${placement.padId}`,
      );
    }
    if (instanceIds.has(placement.id)) {
      errors.push(`Duplicate checkpoint tower id: ${placement.id}`);
    }
    if (padIds.has(placement.padId)) {
      errors.push(`Multiple checkpoint towers occupy: ${placement.padId}`);
    }
    instanceIds.add(placement.id);
    padIds.add(placement.padId);
  }

  for (const modifierId of checkpoint.modifierIds) {
    if (!Object.hasOwn(modifierDefinitions, modifierId)) {
      errors.push(`Unknown checkpoint modifier: ${modifierId}`);
    } else if (!level.availableModifierIds.includes(modifierId)) {
      errors.push(`Unavailable checkpoint modifier: ${modifierId}`);
    }
  }
  for (const towerId of checkpoint.metrics.usedTowerIds) {
    if (!Object.hasOwn(towerDefinitions, towerId)) {
      errors.push(`Unknown used tower: ${towerId}`);
    }
  }
  for (const enemyId of Object.keys(checkpoint.metrics.leakedByEnemyId ?? {})) {
    if (!Object.hasOwn(enemyDefinitions, enemyId)) {
      errors.push(`Unknown leaked enemy: ${enemyId}`);
    }
  }
  for (const enemyId of Object.keys(
    checkpoint.metrics.lastEnemyClearedTick ?? {},
  )) {
    if (!Object.hasOwn(enemyDefinitions, enemyId)) {
      errors.push(`Unknown cleared-tick enemy: ${enemyId}`);
    }
  }
  for (const waveIndexKey of Object.keys(
    checkpoint.metrics.leakedByWaveIndex ?? {},
  )) {
    const waveIndex = Number.parseInt(waveIndexKey, 10);
    if (
      !Number.isInteger(waveIndex) ||
      waveIndex < 0 ||
      waveIndex >= level.waves.length
    ) {
      errors.push(`Unknown leaked-by-wave index: ${waveIndexKey}`);
    }
  }
  for (const waveIndex of checkpoint.metrics.referredWaveIndices ?? []) {
    if (
      waveIndex < 0 ||
      waveIndex >= level.waves.length ||
      !level.waves[waveIndex]?.referral
    ) {
      errors.push(`Unknown referred wave index: ${waveIndex}`);
    }
  }
  if (checkpoint.loadoutSnapshot) {
    errors.push(...validateLoadoutSnapshot(checkpoint.loadoutSnapshot));
  }
  for (const enemyId of checkpoint.metrics.defeatedBossEnemyIds ?? []) {
    const enemy = enemyDefinitions[enemyId as keyof typeof enemyDefinitions];
    if (!enemy?.boss) {
      errors.push(`Unknown defeated boss: ${enemyId}`);
    }
  }
  for (const itemId of Object.keys(checkpoint.metrics.equipment ?? {})) {
    if (!Object.hasOwn(equipmentDefinitions, itemId)) {
      errors.push(`Unknown checkpoint equipment metric: ${itemId}`);
    }
  }

  return errors;
}

export function validateSaveDataContent(save: SaveData): readonly string[] {
  const errors: string[] = [];
  const campaignNodeIds = new Set(campaignNodes.map((node) => node.id));
  for (const nodeId of save.campaign.unlockedNodeIds) {
    if (!campaignNodeIds.has(nodeId)) {
      errors.push(`Unknown campaign node: ${nodeId}`);
    }
  }

  for (const [levelId, progress] of Object.entries(save.campaign.levels)) {
    const level = Object.hasOwn(levelDefinitions, levelId)
      ? levelDefinitions[levelId as keyof typeof levelDefinitions]
      : undefined;
    if (!level) {
      errors.push(`Unknown progress level: ${levelId}`);
      continue;
    }
    const masteryIds = new Set(level.mastery.map((mastery) => mastery.id));
    for (const masteryId of progress.completedMasteryIds) {
      if (!masteryIds.has(masteryId)) {
        errors.push(`Unknown mastery for ${levelId}: ${masteryId}`);
      }
    }
    for (const modifierId of progress.completedModifierIds) {
      if (!level.availableModifierIds.includes(modifierId)) {
        errors.push(`Unknown modifier for ${levelId}: ${modifierId}`);
      }
    }
  }

  for (const result of save.campaign.recentResults) {
    const level = Object.hasOwn(levelDefinitions, result.levelId)
      ? levelDefinitions[result.levelId as keyof typeof levelDefinitions]
      : undefined;
    if (!level) {
      errors.push(`Unknown result level: ${result.levelId}`);
      continue;
    }
    for (const modifierId of result.modifierIds) {
      if (!level.availableModifierIds.includes(modifierId)) {
        errors.push(`Unknown result modifier: ${modifierId}`);
      }
    }
    if (result.loadoutSnapshot) {
      errors.push(...validateLoadoutSnapshot(result.loadoutSnapshot));
    }
    for (const itemId of Object.keys(result.equipmentMetrics ?? {})) {
      if (!Object.hasOwn(equipmentDefinitions, itemId)) {
        errors.push(`Unknown result equipment metric: ${itemId}`);
      }
    }
    for (const enemyId of result.defeatedBossEnemyIds ?? []) {
      const enemy = enemyDefinitions[enemyId as keyof typeof enemyDefinitions];
      if (!enemy?.boss) {
        errors.push(`Unknown result defeated boss: ${enemyId}`);
      }
    }
  }

  const ownedItemIds = new Set(save.inventory.ownedItemIds);
  if (ownedItemIds.size !== save.inventory.ownedItemIds.length) {
    errors.push("Inventory contains duplicate item ids");
  }
  for (const itemId of ownedItemIds) {
    if (!Object.hasOwn(equipmentDefinitions, itemId)) {
      errors.push(`Unknown inventory equipment: ${itemId}`);
    }
  }
  for (const itemId of Object.keys(save.inventory.metadata)) {
    if (!ownedItemIds.has(itemId)) {
      errors.push(`Inventory metadata has no owned item: ${itemId}`);
    }
  }
  errors.push(...validateLoadoutSnapshot(save.loadouts));
  for (const defenderLoadout of Object.values(save.loadouts)) {
    for (const itemId of Object.values(defenderLoadout)) {
      if (itemId && !ownedItemIds.has(itemId)) {
        errors.push(`Equipped item is not owned: ${itemId}`);
      }
    }
  }
  const receiptIds = save.economy.recentReceipts.map(
    (receipt) => receipt.requestId,
  );
  if (new Set(receiptIds).size !== receiptIds.length) {
    errors.push("Economy contains duplicate request receipts");
  }

  if (save.checkpoint) {
    errors.push(...validateCheckpointContent(save.checkpoint));
  }
  return errors;
}
