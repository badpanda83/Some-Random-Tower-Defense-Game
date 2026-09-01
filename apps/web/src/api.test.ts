import { CONTENT_VERSION, type CloudSave, type Profile } from "@srtg/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { synchronizeSave } from "./api.js";
import { createFreshSave } from "./save.js";
import type { LocalSaveRecord } from "./storage.js";

vi.mock("./auth.js", () => ({
  ensureGuestSession: vi.fn(async () => undefined),
}));

const linkedProfile: Profile = {
  id: "linked-user",
  displayName: "Linked Adventurer",
  isAnonymous: false,
  email: "hero@example.test",
};

function remoteSave(muted: boolean): CloudSave {
  return {
    slot: "campaign",
    revision: 1,
    updatedAt: "2026-08-31T12:00:00.000Z",
    data: {
      ...createFreshSave(),
      contentVersion: CONTENT_VERSION,
      settings: { ...createFreshSave().settings, muted },
    },
  };
}

function localSave(muted: boolean): LocalSaveRecord {
  return {
    data: {
      ...createFreshSave(),
      settings: { ...createFreshSave().settings, muted },
    },
    cloudOwnerId: "guest-user",
    cloudRevision: 1,
    pending: false,
    updatedAt: "2026-08-31T11:00:00.000Z",
  };
}

function mockCloud(remote: CloudSave) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/profile") {
        return Response.json(linkedProfile);
      }
      if (path === "/api/saves/campaign") {
        return Response.json(remote);
      }
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cloud identity boundaries", () => {
  it("surfaces equal revision numbers as a conflict when owners differ", async () => {
    mockCloud(remoteSave(false));

    const result = await synchronizeSave(localSave(true));

    expect(result.type).toBe("conflict");
  });

  it("rebinds an identical migrated guest save to the linked owner", async () => {
    mockCloud(remoteSave(true));

    const result = await synchronizeSave(localSave(true));

    expect(result.type).toBe("synced");
    if (result.type === "synced") {
      expect(result.record.cloudOwnerId).toBe("linked-user");
      expect(result.record.pending).toBe(false);
    }
  });
});
