import { CONTENT_VERSION, type CloudSave, type Profile } from "@srtg/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCloudSave, synchronizeSave } from "./api.js";
import { createFreshSave, withBattleResult } from "./save.js";
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
  it("migrates a legacy cloud payload before current-schema validation", async () => {
    const remote = remoteSave(false);
    mockCloud({
      ...remote,
      data: {
        ...remote.data,
        contentVersion: 1,
        campaign: {
          ...remote.data.campaign,
          unlockedNodeIds: ["muddy-moat", "mimic-market"],
        },
      },
    } as unknown as CloudSave);

    const migrated = await getCloudSave();

    expect(migrated?.data.contentVersion).toBe(CONTENT_VERSION);
    expect(migrated?.data.campaign.unlockedNodeIds).toContain("mimic-market");
    expect(migrated?.data.settings.keepPlayingWhileAway).toBe(false);
  });

  it("keeps meaningful guest progress separate when a returning account signs in", async () => {
    const local = localSave(true);
    const remote = remoteSave(false);
    mockCloud(remote);

    const result = await synchronizeSave(local);

    expect(result.type).toBe("conflict");
    if (result.type === "conflict") {
      expect(result.local).toBe(local);
      expect(result.remote).toEqual(remote);
    }
  });

  it("loads a returning account's cloud save on a fresh device", async () => {
    const remote = remoteSave(true);
    remote.data.campaign.unlockedNodeIds = ["muddy-moat", "mimic-market"];
    mockCloud(remote);
    const freshDevice: LocalSaveRecord = {
      data: createFreshSave(),
      cloudOwnerId: "fresh-anonymous-user",
      cloudRevision: 1,
      pending: false,
      updatedAt: "2026-08-31T11:00:00.000Z",
    };

    const result = await synchronizeSave(freshDevice);

    expect(result.type).toBe("synced");
    if (result.type === "synced") {
      expect(result.profile).toEqual(linkedProfile);
      expect(result.record.cloudOwnerId).toBe(linkedProfile.id);
      expect(result.record.pending).toBe(false);
      expect(result.record.data.campaign.unlockedNodeIds).toContain(
        "mimic-market",
      );
    }
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

  it("rebases over a cloud revision this client already submitted", async () => {
    const submitted = remoteSave(false).data;
    const pending = {
      ...localSave(true),
      cloudOwnerId: linkedProfile.id,
      pending: true,
      data: {
        ...localSave(true).data,
        settings: {
          ...localSave(true).data.settings,
          keepPlayingWhileAway: true,
        },
      },
    };
    const put = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json({
          ...remoteSave(true),
          revision: 2,
          data: pending.data,
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/profile") {
          return Response.json(linkedProfile);
        }
        if (path === "/api/saves/campaign" && init?.method === "PUT") {
          return put(input, init);
        }
        if (path === "/api/saves/campaign") {
          return Response.json({
            ...remoteSave(false),
            revision: 2,
            data: submitted,
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const result = await synchronizeSave(pending, [submitted]);

    expect(result.type).toBe("synced");
    expect(put).toHaveBeenCalledOnce();
    expect(JSON.parse(String(put.mock.calls[0]?.[1]?.body))).toMatchObject({
      expectedRevision: 2,
      data: {
        settings: { keepPlayingWhileAway: true },
      },
    });
  });

  it("does not infer ancestry from monotonic-looking progress", async () => {
    const checkpoint = {
      levelId: "muddy-moat",
      seed: 7,
      modifierIds: [],
      tick: 100,
      nextWave: 5,
      lives: 12,
      gold: 100,
      score: 1000,
      spawnedEnemies: 50,
      placements: [],
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    };
    const remote = {
      ...remoteSave(false),
      revision: 2,
      data: { ...createFreshSave(), checkpoint },
    };
    const result = {
      levelId: "muddy-moat",
      seed: 7,
      contentVersion: CONTENT_VERSION,
      modifierIds: [],
      result: "victory" as const,
      score: 5000,
      completedMasteryIds: [],
      completedAt: "2026-08-31T12:05:00.000Z",
    };
    const local = {
      ...localSave(false),
      cloudOwnerId: linkedProfile.id,
      pending: true,
      data: withBattleResult(createFreshSave(), result),
    };
    const put = vi.fn(async () =>
      Response.json({ ...remote, revision: 3, data: local.data }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/profile") {
          return Response.json(linkedProfile);
        }
        if (path === "/api/saves/campaign" && init?.method === "PUT") {
          return put();
        }
        if (path === "/api/saves/campaign") {
          return Response.json(remote);
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const synchronized = await synchronizeSave(local);

    expect(synchronized.type).toBe("conflict");
    expect(put).not.toHaveBeenCalled();
  });
});
