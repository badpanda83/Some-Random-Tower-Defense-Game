import type {
  BattleCheckpoint,
  BattleResult,
  LoadoutSnapshot,
  SaveData,
} from "@srtg/protocol";
import { grantMissionRewards, type MissionRewardLine } from "@srtg/game-core";

import { withBattleResult, withoutBattleCheckpoint } from "./save.js";

export interface BattleSetup {
  readonly levelId: string;
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly unlockedRewardIds: readonly string[];
  readonly checkpoint: BattleCheckpoint | null;
  readonly attemptId: string;
  readonly loadoutSnapshot: LoadoutSnapshot;
  readonly key: number;
}

export interface BattleCompletion {
  readonly save: SaveData;
  readonly lines: readonly MissionRewardLine[];
  readonly recorded: boolean;
}

export function resolveBattleCompletion(
  save: SaveData,
  result: BattleResult,
  recordCampaignResult: boolean,
): BattleCompletion {
  if (!recordCampaignResult) {
    return {
      save: withoutBattleCheckpoint(save),
      lines: [],
      recorded: false,
    };
  }
  const reward = grantMissionRewards(save, result);
  return {
    save: withBattleResult(reward.save, result),
    lines: reward.lines,
    recorded: true,
  };
}

export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return ((values[0] ?? 1) % 2_147_483_646) + 1;
}

export function randomAttemptId(): string {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return `attempt-${[...values]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("")}`;
}

export function createRetryBattleSetup(
  battle: BattleSetup,
  seed = randomSeed(),
  attemptId = randomAttemptId(),
  key = Date.now(),
): BattleSetup {
  return {
    ...battle,
    seed,
    checkpoint: null,
    attemptId,
    loadoutSnapshot: battle.loadoutSnapshot,
    key,
  };
}

export async function prepareBattleRetry(
  battle: BattleSetup,
  save: SaveData,
  persist: (data: SaveData) => Promise<void>,
  seed = randomSeed(),
  attemptId = randomAttemptId(),
  key = Date.now(),
): Promise<BattleSetup> {
  await persist(withoutBattleCheckpoint(save));
  return createRetryBattleSetup(battle, seed, attemptId, key);
}
