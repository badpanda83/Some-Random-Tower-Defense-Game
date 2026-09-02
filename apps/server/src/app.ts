import { existsSync } from "node:fs";
import { resolve } from "node:path";

import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import fastifyStatic from "@fastify/static";
import { validateSaveDataContent } from "@srtg/game-core";
import {
  apiErrorSchema,
  cloudSaveSchema,
  parseSaveDataWithMigration,
  profileSchema,
  saveConflictSchema,
} from "@srtg/protocol";
import { z } from "zod";

import {
  AUTH_CLIENT_IP_HEADER,
  type AuthServices,
  type AuthenticatedUser,
} from "./auth.js";
import type { AppConfig } from "./config.js";
import type { GameRepository, StoredSave } from "./database/repository.js";

const slotParametersSchema = z.object({
  slot: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});

const putSaveEnvelopeSchema = z.object({
  expectedRevision: z.number().int().min(0),
  data: z.unknown(),
});

interface BuildAppOptions {
  readonly config: AppConfig;
  readonly auth: AuthServices;
  readonly repository: GameRepository;
  readonly logger?: boolean;
  readonly staticDirectory?: string | null;
}

function responseSave(save: StoredSave) {
  return cloudSaveSchema.parse({
    slot: save.slot,
    revision: save.revision,
    updatedAt: save.updatedAt.toISOString(),
    data: parseSaveDataWithMigration(save.data),
  });
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send(
    apiErrorSchema.parse({
      code: "INVALID_REQUEST",
      message,
    }),
  );
}

function nodeHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === AUTH_CLIENT_IP_HEADER) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
  return headers;
}

async function authenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthServices,
): Promise<AuthenticatedUser | null> {
  const user = await auth.getUser(nodeHeaders(request));
  if (!user) {
    reply.code(401).send({
      code: "AUTH_REQUIRED",
      message: "A guest or linked session is required.",
    });
    return null;
  }
  return user;
}

async function authRequest(
  request: FastifyRequest,
  config: AppConfig,
): Promise<Request> {
  const url = new URL(request.url, config.publicUrl);
  const init: RequestInit = {
    method: request.method,
    headers: nodeHeaders(request),
  };
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body !== undefined
  ) {
    init.body =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
  }
  return new Request(url, init);
}

async function relayAuthResponse(
  response: Response,
  reply: FastifyReply,
): Promise<FastifyReply> {
  reply.code(response.status);
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") {
      reply.header(name, value);
    }
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header("set-cookie", cookies);
  }
  const body = Buffer.from(await response.arrayBuffer());
  return reply.send(body.length > 0 ? body : undefined);
}

export async function buildApp({
  config,
  auth,
  repository,
  logger = false,
  staticDirectory,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = fastify({
    logger,
    bodyLimit: 256 * 1024,
    trustProxy: config.trustProxy,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    max: config.nodeEnv === "test" ? 10_000 : 240,
    timeWindow: "1 minute",
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      rateLimit: {
        max: config.nodeEnv === "test" ? 10_000 : 30,
        timeWindow: "1 minute",
      },
    },
    async handler(request, reply) {
      const response = await auth.handle(await authRequest(request, config));
      return relayAuthResponse(response, reply);
    },
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await repository.ready();
      return { status: "ready" };
    } catch (error) {
      app.log.error(error, "Database readiness check failed");
      return reply.code(503).send({
        status: "unavailable",
      });
    }
  });

  app.get("/api/profile", async (request, reply) => {
    const user = await authenticatedUser(request, reply, auth);
    if (!user) {
      return;
    }
    const displayName = user.name.trim() || "Linked Adventurer";
    const profile = await repository.ensureProfile(user.id, displayName);
    return profileSchema.parse({
      id: profile.userId,
      displayName: profile.displayName,
      isAnonymous: user.isAnonymous,
      email: user.isAnonymous ? null : user.email,
    });
  });

  app.get("/api/saves/:slot", async (request, reply) => {
    const user = await authenticatedUser(request, reply, auth);
    if (!user) {
      return;
    }
    const parameters = slotParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return badRequest(reply, "The save slot name is invalid.");
    }
    const save = await repository.getSave(user.id, parameters.data.slot);
    if (!save) {
      return reply.code(404).send({
        code: "SAVE_NOT_FOUND",
        message: "No save exists in that slot.",
      });
    }
    return responseSave(save);
  });

  app.put(
    "/api/saves/:slot",
    {
      config: {
        rateLimit: {
          max: config.nodeEnv === "test" ? 10_000 : 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const user = await authenticatedUser(request, reply, auth);
      if (!user) {
        return;
      }
      const parameters = slotParametersSchema.safeParse(request.params);
      if (!parameters.success) {
        return badRequest(reply, "The save slot name is invalid.");
      }
      const envelope = putSaveEnvelopeSchema.safeParse(request.body);
      if (!envelope.success) {
        return badRequest(reply, "The save payload is invalid or unsupported.");
      }
      let data;
      try {
        data = parseSaveDataWithMigration(envelope.data.data);
      } catch {
        return badRequest(reply, "The save payload is invalid or unsupported.");
      }
      if (!data.campaign.unlockedNodeIds.includes("muddy-moat")) {
        return badRequest(
          reply,
          "The starting campaign node must remain unlocked.",
        );
      }
      const contentErrors = validateSaveDataContent(data);
      if (contentErrors.length > 0) {
        return badRequest(
          reply,
          contentErrors[0] ?? "The save references unknown game content.",
        );
      }
      if (JSON.stringify(data).length > 200 * 1024) {
        return badRequest(reply, "The save payload exceeds the 200 KiB limit.");
      }

      const result = await repository.putSave(
        user.id,
        parameters.data.slot,
        envelope.data.expectedRevision,
        data,
      );
      if (result.type === "conflict") {
        return reply.code(409).send(
          saveConflictSchema.parse({
            code: "SAVE_CONFLICT",
            message:
              "The cloud save changed since this device last synchronized.",
            remote: responseSave(result.save),
          }),
        );
      }
      return responseSave(result.save);
    },
  );

  const resolvedStaticDirectory =
    staticDirectory === undefined
      ? resolve(import.meta.dirname, "../../web/dist")
      : staticDirectory;
  if (resolvedStaticDirectory && existsSync(resolvedStaticDirectory)) {
    await app.register(fastifyStatic, {
      root: resolvedStaticDirectory,
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.method === "GET" &&
        request.headers.accept?.includes("text/html") &&
        !request.url.startsWith("/api/") &&
        !request.url.startsWith("/health/")
      ) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({
        code: "NOT_FOUND",
        message: "That route does not exist.",
      });
    });
  }

  return app;
}
