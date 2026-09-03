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
  const linkGuestId = randomUUID();
  const linkedUserId = randomUUID();

  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    repository = createGameRepository(database);
    await database.db.insert(users).values([
      {
        id: userId,
        name: "Integration Hero",
        email: `${userId}@example.test`,
        emailVerified: false,
        isAnonymous: true,
      },
      {
        id: linkGuestId,
        name: "Guest Link Hero",
        email: `${linkGuestId}@example.test`,
        emailVerified: false,
        isAnonymous: true,
      },
      {
        id: linkedUserId,
        name: "Linked Integration Hero",
        email: `${linkedUserId}@example.test`,
        emailVerified: true,
        isAnonymous: false,
      },
    ]);
  });

  afterAll(async () => {
    await database.db.delete(users).where(eq(users.id, userId));
    await database.db.delete(users).where(eq(users.id, linkGuestId));
    await database.db.delete(users).where(eq(users.id, linkedUserId));
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

  it("preserves the guest profile and save when an account is linked", async () => {
    await repository.ensureProfile(linkGuestId, "Guest Progress");
    await repository.putSave(linkGuestId, "linked-campaign", 0, saveData);

    await repository.migrateGuestData(linkGuestId, linkedUserId);

    expect(
      await repository.ensureProfile(linkedUserId, "Replacement Name"),
    ).toEqual({
      userId: linkedUserId,
      displayName: "Guest Progress",
    });
    expect(
      await repository.getSave(linkedUserId, "linked-campaign"),
    ).toMatchObject({
      slot: "linked-campaign",
      revision: 1,
      data: saveData,
    });
  });

  it("keeps both saves when a returning account already has cloud progress", async () => {
    const slot = "returning-campaign";
    const returningData = {
      ...saveData,
      settings: { ...saveData.settings, muted: true },
    };
    await repository.putSave(linkGuestId, slot, 0, saveData);
    await repository.putSave(linkedUserId, slot, 0, returningData);

    await repository.migrateGuestData(linkGuestId, linkedUserId);

    expect(await repository.getSave(linkGuestId, slot)).toMatchObject({
      revision: 1,
      data: saveData,
    });
    expect(await repository.getSave(linkedUserId, slot)).toMatchObject({
      revision: 1,
      data: returningData,
    });
  });
});
