import {
  CONTENT_VERSION,
  type BattleCheckpoint,
  type BattleResult,
  type SaveData,
} from "@srtg/protocol";
import { campaignNodes } from "@srtg/game-core";

const MAX_RECORDED_ATTEMPTS = 2000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function saveDataEqual(left: SaveData, right: SaveData): boolean {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

export function createFreshSave(): SaveData {
  return {
    contentVersion: CONTENT_VERSION,
    campaign: {
      unlockedNodeIds: ["muddy-moat"],
      levels: {},
      recentResults: [],
      recordedAttemptIds: [],
    },
    settings: {
      muted: false,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 1,
      keepPlayingWhileAway: false,
    },
    checkpoint: null,
  };
}

export function withCheckpoint(
  save: SaveData,
  checkpoint: BattleCheckpoint | null,
): SaveData {
  return { ...save, checkpoint };
}

export function withoutBattleCheckpoint(save: SaveData): SaveData {
  return { ...save, checkpoint: null };
}

function battleAttemptKey(result: BattleResult): string {
  return [
    result.contentVersion,
    result.levelId,
    result.seed,
    [...result.modifierIds].sort().join(","),
    result.completedAt,
  ].join(":");
}

export function victoriousLevelIds(save: SaveData): ReadonlySet<string> {
  const victoriousLevels = new Set(
    Object.entries(save.campaign.levels)
      .filter(([, progress]) => progress.victories > 0)
      .map(([levelId]) => levelId),
  );
  for (const result of save.campaign.recentResults) {
    if (result.result === "victory") {
      victoriousLevels.add(result.levelId);
    }
  }
  return victoriousLevels;
}

export function normalizeSaveProgress(save: SaveData): SaveData {
  let levels = save.campaign.levels;
  let levelsChanged = false;
  const recentByLevel = new Map<string, Map<string, BattleResult>>();
  for (const result of save.campaign.recentResults) {
    const results =
      recentByLevel.get(result.levelId) ?? new Map<string, BattleResult>();
    results.set(battleAttemptKey(result), result);
    recentByLevel.set(result.levelId, results);
  }
  for (const [levelId, keyedResults] of recentByLevel) {
    const results = [...keyedResults.values()];
    const victories = results.filter((result) => result.result === "victory");
    const previous = levels[levelId];
    const recovered = {
      bestScore: Math.max(
        previous?.bestScore ?? 0,
        ...results.map((result) => result.score),
      ),
      victories: Math.max(previous?.victories ?? 0, victories.length),
      completedMasteryIds: Array.from(
        new Set([
          ...(previous?.completedMasteryIds ?? []),
          ...victories.flatMap((result) => result.completedMasteryIds),
        ]),
      ).sort(),
      completedModifierIds: Array.from(
        new Set([
          ...(previous?.completedModifierIds ?? []),
          ...victories.flatMap((result) => result.modifierIds),
        ]),
      ).sort(),
    };
    if (
      !previous ||
      previous.bestScore !== recovered.bestScore ||
      previous.victories !== recovered.victories ||
      previous.completedMasteryIds.join(",") !==
        recovered.completedMasteryIds.join(",") ||
      previous.completedModifierIds.join(",") !==
        recovered.completedModifierIds.join(",")
    ) {
      if (!levelsChanged) {
        levels = { ...levels };
        levelsChanged = true;
      }
      levels[levelId] = recovered;
    }
  }

  const unlocked = new Set(save.campaign.unlockedNodeIds);
  const victoriousLevels = victoriousLevelIds({
    ...save,
    campaign: { ...save.campaign, levels },
  });
  const completedModifiers = new Set(
    Object.values(levels).flatMap((progress) => progress.completedModifierIds),
  );
  const recordedAttemptIds = Array.from(
    new Set([
      ...save.campaign.recordedAttemptIds,
      ...save.campaign.recentResults.map(battleAttemptKey),
    ]),
  );

  for (const result of save.campaign.recentResults) {
    if (result.result === "victory") {
      result.modifierIds.forEach((modifierId) =>
        completedModifiers.add(modifierId),
      );
    }
  }

  for (const node of campaignNodes) {
    const conditionMet = node.unlockConditions.some((condition) => {
      switch (condition.kind) {
        case "start":
          return true;
        case "victory":
          return victoriousLevels.has(condition.levelId);
        case "legacy-modifier":
          return completedModifiers.has(condition.modifierId);
      }
    });
    if (conditionMet) {
      unlocked.add(node.id);
    }
  }

  const unlockedNodeIds = campaignNodes
    .map((node) => node.id)
    .filter((nodeId) => unlocked.has(nodeId));
  if (
    unlockedNodeIds.length === save.campaign.unlockedNodeIds.length &&
    unlockedNodeIds.every(
      (nodeId, index) => nodeId === save.campaign.unlockedNodeIds[index],
    ) &&
    recordedAttemptIds.length === save.campaign.recordedAttemptIds.length &&
    !levelsChanged
  ) {
    return save;
  }

  return {
    ...save,
    campaign: {
      ...save.campaign,
      levels,
      unlockedNodeIds,
      recordedAttemptIds,
    },
  };
}

export function unlockedRewardIds(save: SaveData): readonly string[] {
  const victoriousLevels = victoriousLevelIds(save);
  const rewards = campaignNodes.flatMap((node) => {
    if (!node.levelId) {
      return [];
    }
    return victoriousLevels.has(node.levelId) ? node.rewardIds : [];
  });
  return Array.from(new Set(rewards));
}

export function withBattleResult(
  save: SaveData,
  result: BattleResult,
): SaveData {
  const attemptKey = battleAttemptKey(result);
  const alreadyRecorded =
    save.campaign.recentResults.some(
      (recorded) => battleAttemptKey(recorded) === attemptKey,
    ) || save.campaign.recordedAttemptIds.includes(attemptKey);
  if (alreadyRecorded) {
    return normalizeSaveProgress({ ...save, checkpoint: null });
  }
  if (save.campaign.recordedAttemptIds.length >= MAX_RECORDED_ATTEMPTS) {
    throw new Error(
      "The result history is full. Link or export this save before recording another battle.",
    );
  }
  const previous = save.campaign.levels[result.levelId];
  const victory = result.result === "victory";
  const mastery = Array.from(
    new Set([
      ...(previous?.completedMasteryIds ?? []),
      ...(victory ? result.completedMasteryIds : []),
    ]),
  ).sort();
  const modifiers = victory
    ? Array.from(
        new Set([
          ...(previous?.completedModifierIds ?? []),
          ...result.modifierIds,
        ]),
      ).sort()
    : [...(previous?.completedModifierIds ?? [])];

  return normalizeSaveProgress({
    ...save,
    checkpoint: null,
    campaign: {
      unlockedNodeIds: save.campaign.unlockedNodeIds,
      levels: {
        ...save.campaign.levels,
        [result.levelId]: {
          bestScore: Math.max(previous?.bestScore ?? 0, result.score),
          victories: (previous?.victories ?? 0) + (victory ? 1 : 0),
          completedMasteryIds: mastery,
          completedModifierIds: modifiers,
        },
      },
      recentResults: [result, ...save.campaign.recentResults].slice(0, 20),
      recordedAttemptIds: [...save.campaign.recordedAttemptIds, attemptKey],
    },
  });
}
