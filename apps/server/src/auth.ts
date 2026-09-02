import { randomInt } from "node:crypto";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { anonymous, magicLink } from "better-auth/plugins";

import type { AppConfig } from "./config.js";
import type { Database } from "./database/client.js";
import type { GameRepository } from "./database/repository.js";
import { authSchema } from "./database/schema.js";
import { createEmailSender } from "./email.js";

export const AUTH_CLIENT_IP_HEADER = "x-dubious-client-ip";

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

export function trustedOriginsFor(config: AppConfig): string[] {
  return config.nodeEnv === "development"
    ? [config.publicUrl, "http://localhost:5173"]
    : [config.publicUrl];
}

export async function migrateLinkedGuestData(
  repository: Pick<GameRepository, "migrateGuestData">,
  anonymousUserId: string,
  newUserId: string,
): Promise<void> {
  await repository.migrateGuestData(anonymousUserId, newUserId);
}

export function advancedAuthOptions(config: AppConfig) {
  return {
    cookiePrefix: "dubious-realm",
    useSecureCookies: config.publicUrl.startsWith("https://"),
    ipAddress: {
      ipAddressHeaders: [AUTH_CLIENT_IP_HEADER],
    },
  };
}

export function createAuthServices(
  config: AppConfig,
  database: Database,
  repository: GameRepository,
): AuthServices {
  const emailSender = createEmailSender(config.email);

  const auth = betterAuth({
    appName: "The Dubious Realm",
    baseURL: config.publicUrl,
    secret: config.authSecret,
    database: drizzleAdapter(database.db, {
      provider: "pg",
      schema: authSchema,
    }),
    trustedOrigins: trustedOriginsFor(config),
    advanced: advancedAuthOptions(config),
    plugins: [
      anonymous({
        generateName: () => `Guest Adventurer ${randomInt(1000, 10_000)}`,
        async onLinkAccount({ anonymousUser, newUser }) {
          await migrateLinkedGuestData(
            repository,
            anonymousUser.user.id,
            newUser.user.id,
          );
        },
      }),
      magicLink({
        expiresIn: 10 * 60,
        storeToken: "hashed",
        async sendMagicLink({ email, url }) {
          await emailSender.sendMagicLink({ email, url });
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
