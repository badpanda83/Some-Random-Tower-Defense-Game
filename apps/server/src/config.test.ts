import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("server configuration", () => {
  it("trusts forwarded headers only when explicitly enabled", () => {
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(true);
  });

  it("rejects the development auth secret in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET",
    );
  });
});
