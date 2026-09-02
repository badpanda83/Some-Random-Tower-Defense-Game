import type { BattleCheckpoint, SaveData } from "@srtg/protocol";

import {
  campaignNodes,
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  towerDefinitions,
} from "./content.js";

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
  }

  if (save.checkpoint) {
    errors.push(...validateCheckpointContent(save.checkpoint));
  }
  return errors;
}
