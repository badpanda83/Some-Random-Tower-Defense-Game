import {
  CONTENT_VERSION,
  type BattleCheckpoint,
  type BattleResult,
  type SaveData,
} from "@srtg/protocol";

export function createFreshSave(): SaveData {
  return {
    contentVersion: CONTENT_VERSION,
    campaign: {
      unlockedNodeIds: ["muddy-moat"],
      levels: {},
      recentResults: [],
    },
    settings: {
      muted: false,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 1,
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

export function withBattleResult(
  save: SaveData,
  result: BattleResult,
): SaveData {
  const alreadyRecorded = save.campaign.recentResults.some(
    (recorded) =>
      recorded.levelId === result.levelId &&
      recorded.seed === result.seed &&
      recorded.completedAt === result.completedAt &&
      recorded.result === result.result,
  );
  if (alreadyRecorded) {
    return { ...save, checkpoint: null };
  }
  const previous = save.campaign.levels[result.levelId];
  const mastery = Array.from(
    new Set([
      ...(previous?.completedMasteryIds ?? []),
      ...result.completedMasteryIds,
    ]),
  ).sort();
  const modifiers =
    result.result === "victory"
      ? Array.from(
          new Set([
            ...(previous?.completedModifierIds ?? []),
            ...result.modifierIds,
          ]),
        ).sort()
      : [...(previous?.completedModifierIds ?? [])];
  const unlocked = new Set(save.campaign.unlockedNodeIds);

  if (result.result === "victory") {
    unlocked.add("mimic-market");
    if (result.modifierIds.includes("stingy-king")) {
      unlocked.add("troll-tollway");
    }
  }

  return {
    ...save,
    checkpoint: null,
    campaign: {
      unlockedNodeIds: [...unlocked],
      levels: {
        ...save.campaign.levels,
        [result.levelId]: {
          bestScore: Math.max(previous?.bestScore ?? 0, result.score),
          victories:
            (previous?.victories ?? 0) + (result.result === "victory" ? 1 : 0),
          completedMasteryIds: mastery,
          completedModifierIds: modifiers,
        },
      },
      recentResults: [result, ...save.campaign.recentResults].slice(0, 20),
    },
  };
}
