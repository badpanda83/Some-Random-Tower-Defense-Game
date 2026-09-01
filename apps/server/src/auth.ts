import { randomInt } from "node:crypto";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { anonymous, magicLink } from "better-auth/plugins";
import nodemailer from "nodemailer";

import type { AppConfig } from "./config.js";
import type { Database } from "./database/client.js";
import type { GameRepository } from "./database/repository.js";
import { authSchema } from "./database/schema.js";

export interface AuthenticatedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly isAnonymous: boolean;
}

export interface AuthServices {
  readonly handle: (request: Request) => Promise<Response>;
  readonly getUser: (headers: Headers) => Promise<AuthenticatedUser | null>;
}

export function createAuthServices(
  config: AppConfig,
  database: Database,
  repository: GameRepository,
): AuthServices {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    ...(config.smtp.user && config.smtp.password
      ? {
          auth: {
            user: config.smtp.user,
            pass: config.smtp.password,
          },
        }
      : {}),
  });

  const auth = betterAuth({
    appName: "The Dubious Realm",
    baseURL: config.publicUrl,
    secret: config.authSecret,
    database: drizzleAdapter(database.db, {
      provider: "pg",
      schema: authSchema,
    }),
    trustedOrigins:
      config.nodeEnv === "development"
        ? [config.publicUrl, "http://localhost:5173"]
        : [config.publicUrl],
    advanced: {
      cookiePrefix: "dubious-realm",
      useSecureCookies: config.publicUrl.startsWith("https://"),
    },
    plugins: [
      anonymous({
        generateName: () => `Guest Adventurer ${randomInt(1000, 10_000)}`,
        async onLinkAccount({ anonymousUser, newUser }) {
          await repository.migrateGuestData(
            anonymousUser.user.id,
            newUser.user.id,
          );
        },
      }),
      magicLink({
        expiresIn: 10 * 60,
        storeToken: "hashed",
        async sendMagicLink({ email, url }) {
          await transport.sendMail({
            from: config.smtp.from,
            to: email,
            subject: "Your portal to The Dubious Realm",
            text: `Open this one-use portal within ten minutes:\n\n${url}\n\nIf you did not request it, ignore this message.`,
            html: `<p>Open this one-use portal within ten minutes:</p><p><a href="${url}">Enter The Dubious Realm</a></p><p>If you did not request it, ignore this message.</p>`,
          });
        },
      }),
    ],
  });

  return {
    handle: (request) => auth.handler(request),
    async getUser(headers) {
      const result = await auth.api.getSession({ headers });
      if (!result) {
        return null;
      }
      return {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        isAnonymous: result.user.isAnonymous ?? false,
      };
    },
  };
}
