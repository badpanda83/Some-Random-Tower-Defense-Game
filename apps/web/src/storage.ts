import { saveDataSchema, type SaveData } from "@srtg/protocol";
import { openDB, type DBSchema } from "idb";

import { createFreshSave } from "./save.js";

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

  const parsed = saveDataSchema.safeParse(stored.data);
  if (!parsed.success) {
    throw new Error(
      "The local save uses an unsupported format. Clear site data or update the game.",
    );
  }

  return {
    ...stored,
    data: parsed.data,
    cloudOwnerId:
      typeof stored.cloudOwnerId === "string" ? stored.cloudOwnerId : null,
  };
}

export async function storeLocalSave(record: LocalSaveRecord): Promise<void> {
  await (await database()).put("saves", record, SAVE_KEY);
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
