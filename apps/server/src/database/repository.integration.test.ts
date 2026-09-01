import { randomUUID } from "node:crypto";

import { CONTENT_VERSION, type SaveData } from "@srtg/protocol";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "./client.js";
import { createGameRepository, type GameRepository } from "./repository.js";
import { users } from "./schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

const saveData: SaveData = {
  contentVersion: CONTENT_VERSION,
  campaign: {
    unlockedNodeIds: ["muddy-moat"],
    levels: {},
    recentResults: [],
    recordedAttemptIds: [],
  },
  settings: {
    muted: false,
    reducedMotion: false,
    lowEffects: false,
    gameSpeed: 1,
  },
  checkpoint: null,
};

describe.runIf(Boolean(databaseUrl))("PostgreSQL game repository", () => {
  let database: Database;
  let repository: GameRepository;
  const userId = randomUUID();

  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    repository = createGameRepository(database);
    await database.db.insert(users).values({
      id: userId,
      name: "Integration Hero",
      email: `${userId}@example.test`,
      emailVerified: false,
      isAnonymous: true,
    });
  });

  afterAll(async () => {
    await database.db.delete(users).where(eq(users.id, userId));
    await database.close();
  });

  it("uses compare-and-swap revisions without losing the remote save", async () => {
    const created = await repository.putSave(userId, "campaign", 0, saveData);
    const updated = await repository.putSave(userId, "campaign", 1, {
      ...saveData,
      settings: { ...saveData.settings, muted: true },
    });
    const conflict = await repository.putSave(userId, "campaign", 1, saveData);

    expect(created).toMatchObject({ type: "saved", save: { revision: 1 } });
    expect(updated).toMatchObject({
      type: "saved",
      save: { revision: 2, data: { settings: { muted: true } } },
    });
    expect(conflict).toMatchObject({
      type: "conflict",
      save: { revision: 2, data: { settings: { muted: true } } },
    });
  });

  it("creates a stable player profile", async () => {
    const first = await repository.ensureProfile(userId, "First Name");
    const second = await repository.ensureProfile(userId, "Changed Name");

    expect(first).toEqual({ userId, displayName: "First Name" });
    expect(second).toEqual(first);
  });
});
