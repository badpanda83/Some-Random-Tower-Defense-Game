import { parseSaveDataWithMigration, type SaveData } from "@srtg/protocol";
import { openDB, type DBSchema } from "idb";

import { createFreshSave, normalizeSaveProgress } from "./save.js";

export interface LocalSaveRecord {
  readonly data: SaveData;
  readonly cloudOwnerId: string | null;
  readonly cloudRevision: number;
  readonly pending: boolean;
  readonly updatedAt: string;
}

interface TowerDefenseDatabase extends DBSchema {
  saves: {
    key: string;
    value: LocalSaveRecord;
  };
}

const DATABASE_NAME = "dubious-realm";
const SAVE_KEY = "campaign";

function database() {
  return openDB<TowerDefenseDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("saves")) {
        db.createObjectStore("saves");
      }
    },
  });
}

export function parseLocalSaveData(data: unknown): SaveData {
  try {
    return parseSaveDataWithMigration(data);
  } catch {
    throw new Error(
      "The local save uses an unsupported format. Clear site data or update the game.",
    );
  }
}

export async function loadLocalSave(): Promise<LocalSaveRecord> {
  const stored = await (await database()).get("saves", SAVE_KEY);
  if (!stored) {
    return {
      data: createFreshSave(),
      cloudOwnerId: null,
      cloudRevision: 0,
      pending: true,
      updatedAt: new Date().toISOString(),
    };
  }

  const parsed = parseLocalSaveData(stored.data);

  const normalized = normalizeSaveProgress(parsed);
  const progressRepaired =
    normalized !== parsed ||
    parsed.contentVersion !== stored.data.contentVersion;
  return {
    ...stored,
    data: normalized,
    cloudOwnerId:
      typeof stored.cloudOwnerId === "string" ? stored.cloudOwnerId : null,
    cloudRevision:
      typeof stored.cloudRevision === "number" &&
      Number.isInteger(stored.cloudRevision) &&
      stored.cloudRevision >= 0
        ? stored.cloudRevision
        : 0,
    pending: progressRepaired || stored.pending !== false,
    updatedAt:
      typeof stored.updatedAt === "string"
        ? stored.updatedAt
        : new Date().toISOString(),
  };
}

export async function storeLocalSave(record: LocalSaveRecord): Promise<void> {
  const data = parseLocalSaveData(record.data);
  await (await database()).put("saves", { ...record, data }, SAVE_KEY);
}

export function markLocalChange(
  record: LocalSaveRecord,
  data: SaveData,
): LocalSaveRecord {
  return {
    data,
    cloudOwnerId: record.cloudOwnerId,
    cloudRevision: record.cloudRevision,
    pending: true,
    updatedAt: new Date().toISOString(),
  };
}

export interface LocalSaveWriter {
  store(record: LocalSaveRecord): Promise<void>;
  flush(): Promise<void>;
}

export function createLocalSaveWriter(
  write: (record: LocalSaveRecord) => Promise<void> = storeLocalSave,
): LocalSaveWriter {
  let queue = Promise.resolve();
  return {
    store(record) {
      const current = queue.then(() => write(record));
      queue = current.catch(() => undefined);
      return current;
    },
    flush() {
      return queue;
    },
  };
}
