import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

import { z } from "zod";

const rootEnvironmentFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnvironmentFile)) {
  loadEnvFile(rootEnvironmentFile);
}

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
const optionalNonEmptyEnvironmentString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  PUBLIC_URL: z.url().default("http://localhost:3001"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      "postgresql://tower_defense:tower_defense@localhost:5432/tower_defense",
    ),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-me-now"),
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).optional(),
  RESEND_API_KEY: optionalNonEmptyEnvironmentString,
  EMAIL_SEND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(10_000),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_SECURE: booleanFromEnvironment.default(false),
  TRUST_PROXY: booleanFromEnvironment.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z
    .string()
    .min(3)
    .default("The Dubious Realm <noreply@example.test>"),
  STATIC_DIR: z.string().min(1).optional(),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly publicUrl: string;
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly trustProxy: boolean;
  readonly staticDirectory?: string;
  readonly email:
    | {
        readonly provider: "resend";
        readonly apiKey: string;
        readonly from: string;
        readonly timeoutMs: number;
      }
    | {
        readonly provider: "smtp";
        readonly host: string;
        readonly port: number;
        readonly secure: boolean;
        readonly user?: string;
        readonly password?: string;
        readonly from: string;
        readonly timeoutMs: number;
      };
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.parse(environment);
  if (
    parsed.NODE_ENV === "production" &&
    parsed.BETTER_AUTH_SECRET === "development-only-secret-change-me-now"
  ) {
    throw new Error("BETTER_AUTH_SECRET must be configured in production");
  }
  const emailProvider =
    parsed.EMAIL_PROVIDER ??
    (parsed.NODE_ENV === "production" ? "resend" : "smtp");
  if (parsed.NODE_ENV === "production" && emailProvider !== "resend") {
    throw new Error("EMAIL_PROVIDER must be resend in production");
  }
  if (parsed.NODE_ENV === "production" && !environment.EMAIL_FROM) {
    throw new Error("EMAIL_FROM must be configured in production");
  }
  if (
    emailProvider === "smtp" &&
    Boolean(parsed.SMTP_USER) !== Boolean(parsed.SMTP_PASSWORD)
  ) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }

  let email: AppConfig["email"];
  if (emailProvider === "resend") {
    if (!parsed.RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY must be configured for Resend email delivery",
      );
    }
    email = {
      provider: "resend",
      apiKey: parsed.RESEND_API_KEY,
      from: parsed.EMAIL_FROM,
      timeoutMs: parsed.EMAIL_SEND_TIMEOUT_MS,
    };
  } else {
    const credentials =
      parsed.SMTP_USER && parsed.SMTP_PASSWORD
        ? { user: parsed.SMTP_USER, password: parsed.SMTP_PASSWORD }
        : {};
    email = {
      provider: "smtp",
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      secure: parsed.SMTP_SECURE,
      from: parsed.EMAIL_FROM,
      timeoutMs: parsed.EMAIL_SEND_TIMEOUT_MS,
      ...credentials,
    };
  }

  const staticDirectory = parsed.STATIC_DIR
    ? { staticDirectory: parsed.STATIC_DIR }
    : {};

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    publicUrl: parsed.PUBLIC_URL.replace(/\/$/, ""),
    databaseUrl: parsed.DATABASE_URL,
    authSecret: parsed.BETTER_AUTH_SECRET,
    trustProxy: parsed.TRUST_PROXY,
    ...staticDirectory,
    email,
  };
}
