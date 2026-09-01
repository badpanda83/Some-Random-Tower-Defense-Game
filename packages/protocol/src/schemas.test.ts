import { describe, expect, it } from "vitest";

import {
  CONTENT_VERSION,
  gameCommandSchema,
  saveDataSchema,
} from "./schemas.js";

describe("protocol schemas", () => {
  it("accepts a valid fresh save", () => {
    const save = saveDataSchema.parse({
      contentVersion: CONTENT_VERSION,
      campaign: {
        unlockedNodeIds: ["muddy-moat"],
        levels: {},
        recentResults: [],
      },
      settings: {},
      checkpoint: null,
    });

    expect(save.settings.gameSpeed).toBe(1);
    expect(save.settings.muted).toBe(false);
    expect(save.settings.keepPlayingWhileAway).toBe(false);
  });

  it("rejects unknown commands", () => {
    expect(() => gameCommandSchema.parse({ type: "summon-lawyer" })).toThrow();
  });

  it("accepts the manual battlefield ability command", () => {
    expect(gameCommandSchema.parse({ type: "activate-ability" })).toEqual({
      type: "activate-ability",
    });
  });

  it("rejects saves from an unknown content version", () => {
    expect(() =>
      saveDataSchema.parse({
        contentVersion: 99,
        campaign: {
          unlockedNodeIds: ["muddy-moat"],
          levels: {},
          recentResults: [],
        },
        settings: {},
        checkpoint: null,
      }),
    ).toThrow();
  });
});
