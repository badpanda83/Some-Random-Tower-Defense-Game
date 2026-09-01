import { DEFAULT_SAVE_SLOT, type CloudSave } from "@srtg/protocol";

import type { LocalSaveRecord } from "./storage.js";

export type ConcurrentSyncResolution =
  | {
      readonly type: "resolved";
      readonly record: LocalSaveRecord;
    }
  | {
      readonly type: "conflict";
      readonly remote: CloudSave;
    };

export function reconcileCompletedSync(
  submitted: LocalSaveRecord,
  latest: LocalSaveRecord | null,
  synchronized: LocalSaveRecord,
): ConcurrentSyncResolution {
  if (!latest || latest.updatedAt === submitted.updatedAt) {
    return { type: "resolved", record: synchronized };
  }

  const unseenRemoteChange =
    JSON.stringify(synchronized.data) !== JSON.stringify(submitted.data);
  if (unseenRemoteChange) {
    return {
      type: "conflict",
      remote: {
        slot: DEFAULT_SAVE_SLOT,
        revision: synchronized.cloudRevision,
        updatedAt: synchronized.updatedAt,
        data: synchronized.data,
      },
    };
  }

  return {
    type: "resolved",
    record: {
      ...latest,
      cloudOwnerId: synchronized.cloudOwnerId,
      cloudRevision: synchronized.cloudRevision,
      pending: true,
    },
  };
}
