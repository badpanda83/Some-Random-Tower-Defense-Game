import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { loadConfig } from "../config.js";
import { createDatabase } from "./client.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

try {
  await migrate(database.db, {
    migrationsFolder: resolve(import.meta.dirname, "../../drizzle"),
  });
  console.log("Database migrations applied.");
} finally {
  await database.close();
}
