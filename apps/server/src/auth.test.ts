import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "./config.js";
import {
  advancedAuthOptions,
  AUTH_CLIENT_IP_HEADER,
  migrateLinkedGuestData,
  trustedOriginsFor,
} from "./auth.js";

const productionConfig = {
  nodeEnv: "production",
  publicUrl: "https://game.example",
} as AppConfig;

describe("auth configuration", () => {
  it("keeps callbacks limited to the configured production origin", () => {
    expect(trustedOriginsFor(productionConfig)).toEqual([
      "https://game.example",
    ]);
    expect(
      trustedOriginsFor({
        ...productionConfig,
        nodeEnv: "development",
      }),
    ).toEqual(["https://game.example", "http://localhost:5173"]);
  });

  it("uses only the Fastify-sanitized client IP header", () => {
    expect(advancedAuthOptions(productionConfig).ipAddress).toEqual({
      ipAddressHeaders: [AUTH_CLIENT_IP_HEADER],
    });
  });

  it("migrates guest data through the anonymous account-link hook", async () => {
    const migrateGuestData = vi.fn().mockResolvedValue(undefined);

    await migrateLinkedGuestData(
      { migrateGuestData },
      "anonymous-user",
      "linked-user",
    );

    expect(migrateGuestData).toHaveBeenCalledWith(
      "anonymous-user",
      "linked-user",
    );
  });
});
