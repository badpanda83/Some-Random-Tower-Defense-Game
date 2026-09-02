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

  it("requires Resend configuration in production", () => {
    const production = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      EMAIL_FROM: "The Dubious Realm <noreply@mail.dubiousrealm.com>",
    };

    expect(() => loadConfig(production)).toThrow("RESEND_API_KEY");
    expect(() =>
      loadConfig({
        ...production,
        RESEND_API_KEY: "re_test",
        EMAIL_PROVIDER: "smtp",
      }),
    ).toThrow("EMAIL_PROVIDER");
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
        RESEND_API_KEY: "re_test",
      }),
    ).toThrow("EMAIL_FROM");
  });

  it("uses Resend in production and ignores legacy SMTP variables", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "The Dubious Realm <noreply@mail.dubiousrealm.com>",
      SMTP_USER: "legacy-user",
    });

    expect(config.email).toMatchObject({
      provider: "resend",
      apiKey: "re_test",
    });
  });

  it("keeps SMTP as the explicit local development provider", () => {
    expect(
      loadConfig({
        EMAIL_PROVIDER: "smtp",
        RESEND_API_KEY: "",
        SMTP_HOST: "mailpit",
        SMTP_PORT: "1025",
      }).email,
    ).toMatchObject({
      provider: "smtp",
      host: "mailpit",
      port: 1025,
    });
  });
});
