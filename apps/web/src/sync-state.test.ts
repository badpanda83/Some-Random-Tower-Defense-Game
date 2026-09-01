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
    const latest = record("user-1", 1, "2026-08-31T10:01:00.000Z", true);
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

  it("keeps newer local edits after their submitted base was uploaded", () => {
    const submitted = record(null, 0, "2026-08-31T10:00:00.000Z");
    const latest = record(null, 0, "2026-08-31T10:01:00.000Z", true);
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
});
