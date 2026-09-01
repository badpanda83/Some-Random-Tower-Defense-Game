import type { SaveData } from "@srtg/protocol";
import { and, eq, sql } from "drizzle-orm";

import type { Database } from "./client.js";
import { gameSaves, playerProfiles } from "./schema.js";

export interface StoredProfile {
  readonly userId: string;
  readonly displayName: string;
}

export interface StoredSave {
  readonly slot: string;
  readonly revision: number;
  readonly updatedAt: Date;
  readonly data: SaveData;
}

export type PutSaveResult =
  | { readonly type: "saved"; readonly save: StoredSave }
  | { readonly type: "conflict"; readonly save: StoredSave };

export interface GameRepository {
  ready(): Promise<void>;
  ensureProfile(userId: string, displayName: string): Promise<StoredProfile>;
  getSave(userId: string, slot: string): Promise<StoredSave | null>;
  putSave(
    userId: string,
    slot: string,
    expectedRevision: number,
    data: SaveData,
  ): Promise<PutSaveResult>;
  migrateGuestData(anonymousUserId: string, newUserId: string): Promise<void>;
}

function toStoredSave(row: typeof gameSaves.$inferSelect): StoredSave {
  return {
    slot: row.slot,
    revision: row.revision,
    updatedAt: row.updatedAt,
    data: row.data,
  };
}

export function createGameRepository(database: Database): GameRepository {
  return {
    async ready() {
      await database.db.execute(sql`select 1`);
    },

    async ensureProfile(userId, displayName) {
      await database.db
        .insert(playerProfiles)
        .values({ userId, displayName })
        .onConflictDoNothing();
      const [profile] = await database.db
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.userId, userId))
        .limit(1);
      if (!profile) {
        throw new Error("Player profile could not be loaded");
      }
      return { userId: profile.userId, displayName: profile.displayName };
    },

    async getSave(userId, slot) {
      const [save] = await database.db
        .select()
        .from(gameSaves)
        .where(and(eq(gameSaves.userId, userId), eq(gameSaves.slot, slot)))
        .limit(1);
      return save ? toStoredSave(save) : null;
    },

    async putSave(userId, slot, expectedRevision, data) {
      const now = new Date();
      const rows =
        expectedRevision === 0
          ? await database.db
              .insert(gameSaves)
              .values({
                userId,
                slot,
                revision: 1,
                contentVersion: data.contentVersion,
                data,
                updatedAt: now,
              })
              .onConflictDoNothing()
              .returning()
          : await database.db
              .update(gameSaves)
              .set({
                revision: sql`${gameSaves.revision} + 1`,
                contentVersion: data.contentVersion,
                data,
                updatedAt: now,
              })
              .where(
                and(
                  eq(gameSaves.userId, userId),
                  eq(gameSaves.slot, slot),
                  eq(gameSaves.revision, expectedRevision),
                ),
              )
              .returning();
      const saved = rows[0];
      if (saved) {
        return { type: "saved", save: toStoredSave(saved) };
      }

      const remote = await this.getSave(userId, slot);
      if (!remote) {
        throw new Error("Save revision changed but no remote save exists");
      }
      return { type: "conflict", save: remote };
    },

    async migrateGuestData(anonymousUserId, newUserId) {
      await database.db.transaction(async (transaction) => {
        const [profile] = await transaction
          .select()
          .from(playerProfiles)
          .where(eq(playerProfiles.userId, anonymousUserId))
          .limit(1);
        if (profile) {
          await transaction
            .insert(playerProfiles)
            .values({
              userId: newUserId,
              displayName: profile.displayName,
            })
            .onConflictDoNothing();
        }

        const saves = await transaction
          .select()
          .from(gameSaves)
          .where(eq(gameSaves.userId, anonymousUserId));
        for (const save of saves) {
          await transaction
            .insert(gameSaves)
            .values({ ...save, userId: newUserId })
            .onConflictDoNothing();
        }
      });
    },
  };
}
