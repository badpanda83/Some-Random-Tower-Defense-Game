import {
  cloudSaveSchema,
  DEFAULT_SAVE_SLOT,
  profileSchema,
  saveConflictSchema,
  type CloudSave,
  type Profile,
} from "@srtg/protocol";

import { ensureGuestSession } from "./auth.js";
import { createFreshSave } from "./save.js";
import type { LocalSaveRecord } from "./storage.js";

class ApiResponseError extends Error {
  public constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
  }
}

export class CloudSaveConflictError extends Error {
  public constructor(public readonly remote: CloudSave) {
    super("The cloud save changed during synchronization.");
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiResponseError(response.status, body);
  }

  return response;
}

export async function getProfile(): Promise<Profile> {
  return profileSchema.parse(await (await request("/api/profile")).json());
}

export async function getCloudSave(): Promise<CloudSave | null> {
  try {
    const response = await request(`/api/saves/${DEFAULT_SAVE_SLOT}`);
    return cloudSaveSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function putCloudSave(
  data: LocalSaveRecord["data"],
  expectedRevision: number,
): Promise<CloudSave> {
  try {
    const response = await request(`/api/saves/${DEFAULT_SAVE_SLOT}`, {
      method: "PUT",
      body: JSON.stringify({ expectedRevision, data }),
    });
    return cloudSaveSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 409) {
      const conflict = saveConflictSchema.safeParse(error.body);
      if (conflict.success) {
        throw new CloudSaveConflictError(conflict.data.remote);
      }
    }
    throw error;
  }
}

export type SyncResult =
  | {
      readonly type: "synced";
      readonly record: LocalSaveRecord;
      readonly profile: Profile;
    }
  | {
      readonly type: "conflict";
      readonly local: LocalSaveRecord;
      readonly remote: CloudSave;
      readonly profile: Profile;
    };

function fromCloud(
  remote: CloudSave,
  ownerId: string,
  localRevision = 0,
): LocalSaveRecord {
  return {
    data: remote.data,
    cloudOwnerId: ownerId,
    cloudRevision: remote.revision,
    localRevision,
    pending: false,
    updatedAt: remote.updatedAt,
  };
}

export async function synchronizeSave(
  local: LocalSaveRecord,
): Promise<SyncResult> {
  await ensureGuestSession();
  const [profile, remote] = await Promise.all([getProfile(), getCloudSave()]);

  const identityChanged =
    local.cloudOwnerId !== null && local.cloudOwnerId !== profile.id;
  const identityUnknown = local.cloudOwnerId === null;

  if (identityChanged || identityUnknown) {
    if (!remote) {
      try {
        const created = await putCloudSave(local.data, 0);
        return {
          type: "synced",
          record: fromCloud(created, profile.id, local.localRevision),
          profile,
        };
      } catch (error) {
        if (error instanceof CloudSaveConflictError) {
          return { type: "conflict", local, remote: error.remote, profile };
        }
        throw error;
      }
    }

    if (JSON.stringify(remote.data) === JSON.stringify(local.data)) {
      return {
        type: "synced",
        record: fromCloud(remote, profile.id, local.localRevision),
        profile,
      };
    }
    if (
      identityUnknown &&
      local.cloudRevision === 0 &&
      local.localRevision === 0 &&
      JSON.stringify(local.data) === JSON.stringify(createFreshSave())
    ) {
      return {
        type: "synced",
        record: fromCloud(remote, profile.id, local.localRevision),
        profile,
      };
    }
    return { type: "conflict", local, remote, profile };
  }

  if (!remote) {
    try {
      const created = await putCloudSave(local.data, 0);
      return {
        type: "synced",
        record: fromCloud(created, profile.id, local.localRevision),
        profile,
      };
    } catch (error) {
      if (error instanceof CloudSaveConflictError) {
        return { type: "conflict", local, remote: error.remote, profile };
      }
      throw error;
    }
  }

  if (local.pending) {
    if (remote.revision !== local.cloudRevision) {
      return { type: "conflict", local, remote, profile };
    }
    try {
      const saved = await putCloudSave(local.data, local.cloudRevision);
      return {
        type: "synced",
        record: fromCloud(saved, profile.id, local.localRevision),
        profile,
      };
    } catch (error) {
      if (error instanceof CloudSaveConflictError) {
        return { type: "conflict", local, remote: error.remote, profile };
      }
      throw error;
    }
  }

  if (remote.revision !== local.cloudRevision) {
    return {
      type: "synced",
      record: fromCloud(remote, profile.id, local.localRevision),
      profile,
    };
  }

  return { type: "synced", record: local, profile };
}

export async function overwriteCloudSave(
  local: LocalSaveRecord,
  remoteRevision: number,
  ownerId: string,
): Promise<LocalSaveRecord> {
  return fromCloud(
    await putCloudSave(local.data, remoteRevision),
    ownerId,
    local.localRevision,
  );
}

export function acceptCloudSave(
  remote: CloudSave,
  ownerId: string,
): LocalSaveRecord {
  return fromCloud(remote, ownerId);
}
