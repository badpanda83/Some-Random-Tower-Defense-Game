import { DEFAULT_SAVE_SLOT, type CloudSave } from "@srtg/protocol";

import { saveDataEqual } from "./save.js";
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
  if (!latest || latest === submitted) {
    return { type: "resolved", record: synchronized };
  }

  if (latest.localOnly) {
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

  const unseenRemoteChange = !saveDataEqual(synchronized.data, submitted.data);
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
