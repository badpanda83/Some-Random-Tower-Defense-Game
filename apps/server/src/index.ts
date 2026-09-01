import { buildApp } from "./app.js";
import { createAuthServices } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./database/client.js";
import { createGameRepository } from "./database/repository.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const repository = createGameRepository(database);
const auth = createAuthServices(config, database, repository);
const app = await buildApp({
  config,
  auth,
  repository,
  logger: true,
  ...(config.staticDirectory
    ? { staticDirectory: config.staticDirectory }
    : {}),
});

let closing = false;
async function close(signal: string): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await database.close();
}

process.once("SIGINT", () => {
  void close("SIGINT");
});
process.once("SIGTERM", () => {
  void close("SIGTERM");
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, "Server failed to start");
  await database.close();
  process.exitCode = 1;
}
