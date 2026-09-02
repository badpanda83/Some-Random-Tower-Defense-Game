import { describe, expect, it } from "vitest";

import { createFreshSave } from "./save.js";
import {
  createLocalSaveWriter,
  parseLocalSaveData,
  type LocalSaveRecord,
} from "./storage.js";

function record(updatedAt: string): LocalSaveRecord {
  return {
    data: createFreshSave(),
    cloudOwnerId: null,
    cloudRevision: 0,
    pending: true,
    updatedAt,
  };
}

describe("local save writer", () => {
  it("serializes every IndexedDB write and continues after a failure", async () => {
    const writes: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const writer = createLocalSaveWriter(async (next) => {
      writes.push(`start:${next.updatedAt}`);
      if (next.updatedAt === "first") {
        await firstBlocked;
        throw new Error("disk full");
      }
      writes.push(`finish:${next.updatedAt}`);
    });

    const first = writer.store(record("first"));
    const second = writer.store(record("second"));
    let flushed = false;
    const flush = writer.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(writes).toEqual(["start:first"]);
    expect(flushed).toBe(false);

    releaseFirst();
    await expect(first).rejects.toThrow("disk full");
    await expect(second).resolves.toBeUndefined();
    await flush;
    expect(flushed).toBe(true);
    expect(writes).toEqual(["start:first", "start:second", "finish:second"]);
  });

  it("migrates legacy campaign data without dropping preview access", () => {
    const legacy = {
      ...createFreshSave(),
      contentVersion: 1,
      campaign: {
        ...createFreshSave().campaign,
        unlockedNodeIds: ["muddy-moat", "mimic-market", "troll-tollway"],
      },
    };

    const loaded = parseLocalSaveData(legacy);

    expect(loaded.contentVersion).toBe(3);
    expect(loaded.campaign.unlockedNodeIds).toEqual([
      "muddy-moat",
      "mimic-market",
      "troll-tollway",
    ]);
    expect(loaded.settings.keepPlayingWhileAway).toBe(false);
  });

  it("reloads the background-play preference without changing other save data", () => {
    const fresh = createFreshSave();
    const loaded = parseLocalSaveData({
      ...fresh,
      settings: { ...fresh.settings, keepPlayingWhileAway: true },
    });

    expect(loaded.settings.keepPlayingWhileAway).toBe(true);
    expect(loaded.campaign).toEqual(fresh.campaign);
  });
});
