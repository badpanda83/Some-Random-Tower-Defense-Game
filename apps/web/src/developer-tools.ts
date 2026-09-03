import { parseSaveDataWithMigration, type SaveData } from "@srtg/protocol";

export const TEST_RESOURCE_AMOUNT = 10_000;

const STORAGE_KEY = "dubious-realm-development-tools";

export interface DevelopmentState {
  readonly snapshot: SaveData;
  readonly missionGoldEnabled: boolean;
}

export function assertDevelopmentRuntime(
  development = import.meta.env.DEV,
): void {
  if (!development) {
    throw new Error("Development tools are unavailable in this build.");
  }
}

function cloneSave(save: SaveData): SaveData {
  return parseSaveDataWithMigration(JSON.parse(JSON.stringify(save)));
}

export function grantTestResources(
  save: SaveData,
  development = import.meta.env.DEV,
): SaveData {
  assertDevelopmentRuntime(development);
  return {
    ...save,
    economy: {
      ...save.economy,
      questCrowns: Math.max(save.economy.questCrowns, TEST_RESOURCE_AMOUNT),
      craftingDust: Math.max(save.economy.craftingDust, TEST_RESOURCE_AMOUNT),
    },
  };
}

export function activateDevelopmentState(
  save: SaveData,
  current: DevelopmentState | null,
  missionGoldEnabled: boolean,
  development = import.meta.env.DEV,
): DevelopmentState {
  assertDevelopmentRuntime(development);
  return {
    snapshot: current?.snapshot ?? cloneSave(save),
    missionGoldEnabled,
  };
}

export function restoreDevelopmentSnapshot(
  state: DevelopmentState,
  development = import.meta.env.DEV,
): SaveData {
  assertDevelopmentRuntime(development);
  return cloneSave(state.snapshot);
}

export function loadDevelopmentState(
  development = import.meta.env.DEV,
): DevelopmentState | null {
  assertDevelopmentRuntime(development);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("snapshot" in parsed) ||
    !("missionGoldEnabled" in parsed) ||
    typeof parsed.missionGoldEnabled !== "boolean"
  ) {
    throw new Error("The development-tools snapshot is invalid.");
  }
  return {
    snapshot: parseSaveDataWithMigration(parsed.snapshot),
    missionGoldEnabled: parsed.missionGoldEnabled,
  };
}

export function storeDevelopmentState(
  state: DevelopmentState,
  development = import.meta.env.DEV,
): void {
  assertDevelopmentRuntime(development);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearDevelopmentState(development = import.meta.env.DEV): void {
  assertDevelopmentRuntime(development);
  localStorage.removeItem(STORAGE_KEY);
}
