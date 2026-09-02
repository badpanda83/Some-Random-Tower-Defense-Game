import { describe, expect, it } from "vitest";

import { createFreshSave } from "./save.js";
import type { LocalSaveRecord } from "./storage.js";
import { reconcileCompletedSync } from "./sync-state.js";

function record(
  owner: string | null,
  revision: number,
  updatedAt: string,
  muted = false,
): LocalSaveRecord {
  return {
    data: {
      ...createFreshSave(),
      settings: { ...createFreshSave().settings, muted },
    },
    cloudOwnerId: owner,
    cloudRevision: revision,
    pending: false,
    updatedAt,
  };
}

describe("concurrent save synchronization", () => {
  it("does not rebase local edits over unseen remote data", () => {
    const submitted = record("user-1", 1, "2026-08-31T10:00:00.000Z");
    const latest = {
      ...record("user-1", 1, "2026-08-31T10:01:00.000Z", true),
    };
    const remote = {
      ...record("user-1", 2, "2026-08-31T10:02:00.000Z"),
      data: {
        ...createFreshSave(),
        campaign: {
          ...createFreshSave().campaign,
          unlockedNodeIds: ["muddy-moat", "mimic-market"],
        },
      },
    };

    expect(reconcileCompletedSync(submitted, latest, remote).type).toBe(
      "conflict",
    );
  });

  it("does not treat timestamp collisions as the same local mutation", () => {
    const submitted = record("user-1", 1, "2026-08-31T10:00:00.000Z");
    const latest = record("user-1", 1, "2026-08-31T10:00:00.000Z", true);
    const uploaded = {
      ...submitted,
      cloudRevision: 2,
      pending: false,
    };

    const resolution = reconcileCompletedSync(submitted, latest, uploaded);

    expect(resolution.type).toBe("resolved");
    if (resolution.type === "resolved") {
      expect(resolution.record.data.settings.muted).toBe(true);
      expect(resolution.record.pending).toBe(true);
    }
  });

  it("keeps newer local edits after their submitted base was uploaded", () => {
    const submitted = record(null, 0, "2026-08-31T10:00:00.000Z");
    const latest = {
      ...record(null, 0, "2026-08-31T10:00:00.000Z", true),
    };
    const uploaded = {
      ...submitted,
      cloudOwnerId: "user-1",
      cloudRevision: 1,
      pending: false,
      updatedAt: "2026-08-31T10:02:00.000Z",
    };

    const resolution = reconcileCompletedSync(submitted, latest, uploaded);

    expect(resolution.type).toBe("resolved");
    if (resolution.type === "resolved") {
      expect(resolution.record.data.settings.muted).toBe(true);
      expect(resolution.record.cloudOwnerId).toBe("user-1");
      expect(resolution.record.cloudRevision).toBe(1);
      expect(resolution.record.pending).toBe(true);
    }
  });

  it("keeps a newer background-play edit after its submitted base syncs", () => {
    const submitted = record("user-1", 1, "2026-08-31T10:00:00.000Z");
    const latest = {
      ...submitted,
      data: {
        ...submitted.data,
        settings: {
          ...submitted.data.settings,
          keepPlayingWhileAway: true,
        },
      },
      pending: true,
    };
    const uploaded = {
      ...submitted,
      cloudRevision: 2,
      pending: false,
    };

    const resolution = reconcileCompletedSync(submitted, latest, uploaded);

    expect(resolution.type).toBe("resolved");
    if (resolution.type === "resolved") {
      expect(resolution.record.data.settings.keepPlayingWhileAway).toBe(true);
      expect(resolution.record.pending).toBe(true);
    }
  });

  it("ignores object key reordering from PostgreSQL JSONB", () => {
    const checkpoint = {
      levelId: "muddy-moat",
      seed: 7,
      modifierIds: [],
      tick: 0,
      nextWave: 0,
      lives: 12,
      gold: 270,
      score: 0,
      abilityChargeTicks: 0,
      spawnedEnemies: 0,
      placements: [],
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    };
    const submitted = {
      ...record("user-1", 1, "2026-08-31T10:00:00.000Z"),
      data: { ...createFreshSave(), checkpoint },
    };
    const latest = {
      ...submitted,
      data: {
        ...submitted.data,
        settings: { ...submitted.data.settings, muted: true },
      },
    };
    const uploaded = {
      ...submitted,
      cloudRevision: 2,
      pending: false,
      data: {
        checkpoint: {
          metrics: {
            usedTowerIds: [],
            soldTowers: 0,
            leakedEnemies: 0,
            spentGold: 0,
          },
          placements: [],
          spawnedEnemies: 0,
          abilityChargeTicks: 0,
          score: 0,
          gold: 270,
          lives: 12,
          nextWave: 0,
          tick: 0,
          modifierIds: [],
          seed: 7,
          levelId: "muddy-moat",
        },
        settings: submitted.data.settings,
        campaign: submitted.data.campaign,
        contentVersion: submitted.data.contentVersion,
      },
    };

    const resolution = reconcileCompletedSync(submitted, latest, uploaded);

    expect(resolution.type).toBe("resolved");
    if (resolution.type === "resolved") {
      expect(resolution.record.data.settings.muted).toBe(true);
      expect(resolution.record.cloudRevision).toBe(2);
    }
  });
});
