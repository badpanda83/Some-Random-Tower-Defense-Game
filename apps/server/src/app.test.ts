import {
  CONTENT_VERSION,
  EMPTY_ECONOMY,
  parseSaveDataWithMigration,
  type SaveData,
} from "@srtg/protocol";
import { equipmentDefinitions } from "@srtg/game-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { AUTH_CLIENT_IP_HEADER, type AuthServices } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { GameRepository, StoredSave } from "./database/repository.js";

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3001,
  publicUrl: "http://localhost:3001",
  databaseUrl: "postgresql://unused",
  authSecret: "test-secret-that-is-definitely-long-enough",
  trustProxy: false,
  email: {
    provider: "smtp",
    host: "localhost",
    port: 1025,
    secure: false,
    from: "test@example.test",
    timeoutMs: 10_000,
  },
};

const freshSave: SaveData = {
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

function fakeAuth(): AuthServices {
  return {
    async handle() {
      return Response.json(
        { ok: true },
        {
          headers: {
            "set-cookie": "dubious-session=test; Path=/; HttpOnly",
          },
        },
      );
    },
    async getUser(headers) {
      if (headers.get("x-no-auth") === "true") {
        return null;
      }
      return {
        id: "user-1",
        name: "Guest Adventurer 1234",
        email: "guest@anonymous.placeholder.invalid",
        isAnonymous: true,
      };
    },
  };
}

function memoryRepository(
  initialSave: StoredSave | null = null,
): GameRepository {
  let save: StoredSave | null = initialSave;
  return {
    async ready() {},
    async ensureProfile(userId, displayName) {
      return { userId, displayName };
    },
    async getSave() {
      return save;
    },
    async putSave(_userId, slot, expectedRevision, data) {
      const currentRevision = save?.revision ?? 0;
      if (currentRevision !== expectedRevision && save) {
        return { type: "conflict", save };
      }
      save = {
        slot,
        revision: currentRevision + 1,
        updatedAt: new Date("2026-08-31T12:00:00.000Z"),
        data,
      };
      return { type: "saved", save };
    },
    async migrateGuestData() {},
  };
}

describe("API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp({
      config,
      auth: fakeAuth(),
      repository: memoryRepository(),
      logger: false,
      staticDirectory: null,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("reports liveness and readiness", async () => {
    const [live, ready] = await Promise.all([
      app.inject({ method: "GET", url: "/health/live" }),
      app.inject({ method: "GET", url: "/health/ready" }),
    ]);

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
  });

  it("requires a session for saves", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/saves/campaign",
      headers: { "x-no-auth": "true" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("creates a save and rejects a stale revision", async () => {
    const created = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: { expectedRevision: 0, data: freshSave },
    });

    const conflict = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: { expectedRevision: 0, data: freshSave },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ revision: 1, slot: "campaign" });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: "SAVE_CONFLICT",
      remote: { revision: 1 },
    });
  });

  it("accepts a supported legacy client upload and stores current data", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: {
        expectedRevision: 0,
        data: {
          ...freshSave,
          contentVersion: 1,
          campaign: {
            ...freshSave.campaign,
            unlockedNodeIds: ["muddy-moat", "mimic-market"],
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      revision: 1,
      data: {
        contentVersion: CONTENT_VERSION,
        campaign: { unlockedNodeIds: ["muddy-moat", "mimic-market"] },
      },
    });
  });

  it("serves legacy stored saves as current data without losing access", async () => {
    await app.close();
    app = await buildApp({
      config,
      auth: fakeAuth(),
      repository: memoryRepository({
        slot: "campaign",
        revision: 4,
        updatedAt: new Date("2026-08-31T12:00:00.000Z"),
        data: {
          ...freshSave,
          contentVersion: 1,
          campaign: {
            ...freshSave.campaign,
            unlockedNodeIds: ["muddy-moat", "mimic-market"],
          },
        } as unknown as SaveData,
      }),
      logger: false,
      staticDirectory: null,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/saves/campaign",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      revision: 4,
      data: {
        contentVersion: CONTENT_VERSION,
        campaign: {
          unlockedNodeIds: ["muddy-moat", "mimic-market"],
        },
      },
    });
  });

  it("rejects malformed and impossible campaign saves", async () => {
    const malformed = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: { expectedRevision: 0, data: { contentVersion: 99 } },
    });
    const impossible = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: {
        expectedRevision: 0,
        data: {
          ...freshSave,
          campaign: {
            ...freshSave.campaign,
            unlockedNodeIds: ["not-the-moat"],
          },
        },
      },
    });
    const unknownContent = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: {
        expectedRevision: 0,
        data: {
          ...freshSave,
          checkpoint: {
            levelId: "muddy-moat",
            seed: 1,
            modifierIds: [],
            tick: 10,
            nextWave: 1,
            lives: 10,
            gold: 100,
            score: 50,
            spawnedEnemies: 8,
            placements: [
              {
                id: "tower-1",
                towerId: "fork-knight",
                padId: "imaginary-pad",
                level: 1,
              },
            ],
            metrics: {
              spentGold: 60,
              leakedEnemies: 0,
              soldTowers: 0,
              usedTowerIds: ["fork-knight"],
            },
          },
        },
      },
    });
    const unknownEquipment = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: {
        expectedRevision: 0,
        data: {
          ...freshSave,
          inventory: {
            ownedItemIds: ["imaginary-sword"],
            metadata: {},
          },
        },
      },
    });

    expect(malformed.statusCode).toBe(400);
    expect(impossible.statusCode).toBe(400);
    expect(unknownContent.statusCode).toBe(400);
    expect(unknownEquipment.statusCode).toBe(400);
  });

  it("accepts a representative bounded v4 save below 200 KiB", async () => {
    const itemIds = Object.keys(equipmentDefinitions);
    const data = {
      ...freshSave,
      campaign: {
        ...freshSave.campaign,
        recordedAttemptIds: Array.from(
          { length: 2_000 },
          (_, index) => `attempt-${String(index).padStart(4, "0")}`,
        ),
      },
      economy: {
        ...EMPTY_ECONOMY,
        rewardClaimIds: Array.from(
          { length: 4_800 },
          (_, index) => `request:${index.toString(36).padStart(14, "0")}`,
        ),
        recentReceipts: Array.from({ length: 100 }, (_, index) => ({
          kind: "chest-opened" as const,
          requestId: `open-${index.toString(36).padStart(16, "0")}`,
          createdAtSequence: index + 1,
          openSequence: index,
          chestType: "defender-trunk" as const,
          focusDefender: "discount-wizard" as const,
          rolledRarity: "S+++" as const,
          rarity: "S+++" as const,
          itemId: "wand-of-definitely-winter",
          duplicate: true,
          questCrownsSpent: 180,
          craftingDustGranted: 450,
        })),
      },
      inventory: {
        ownedItemIds: itemIds,
        metadata: Object.fromEntries(
          itemIds.map((itemId) => [
            itemId,
            { favorite: false, locked: false, isNew: false },
          ]),
        ),
      },
    };
    expect(JSON.stringify(data).length).toBeLessThan(200 * 1024);
    expect(() => parseSaveDataWithMigration(data)).not.toThrow();

    const response = await app.inject({
      method: "PUT",
      url: "/api/saves/campaign",
      payload: { expectedRevision: 0, data },
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it("relays auth responses and cookies", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/anonymous",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain(
      "dubious-session=test",
    );
  });

  it("does not trust spoofed forwarded or internal IP headers in direct mode", async () => {
    let receivedIp: string | null = null;
    await app.close();
    app = await buildApp({
      config,
      auth: {
        ...fakeAuth(),
        async handle(request) {
          receivedIp = request.headers.get(AUTH_CLIENT_IP_HEADER);
          return Response.json({ ok: true });
        },
      },
      repository: memoryRepository(),
      logger: false,
      staticDirectory: null,
    });

    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/anonymous",
      headers: {
        "x-forwarded-for": "198.51.100.20",
        [AUTH_CLIENT_IP_HEADER]: "203.0.113.99",
      },
      payload: {},
    });

    expect(receivedIp).toBe("127.0.0.1");
  });

  it("passes Fastify's Railway client IP only when proxy trust is enabled", async () => {
    let receivedIp: string | null = null;
    await app.close();
    app = await buildApp({
      config: { ...config, trustProxy: true },
      auth: {
        ...fakeAuth(),
        async handle(request) {
          receivedIp = request.headers.get(AUTH_CLIENT_IP_HEADER);
          return Response.json({ ok: true });
        },
      },
      repository: memoryRepository(),
      logger: false,
      staticDirectory: null,
    });

    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/anonymous",
      headers: {
        "x-forwarded-for": "198.51.100.20",
        [AUTH_CLIENT_IP_HEADER]: "203.0.113.99",
      },
      payload: {},
    });

    expect(receivedIp).toBe("198.51.100.20");
  });
});
