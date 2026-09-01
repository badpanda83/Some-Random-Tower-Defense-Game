import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://tower_defense:tower_defense@localhost:5432/tower_defense",
  },
  strict: true,
  verbose: true,
});
