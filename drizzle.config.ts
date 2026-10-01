import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./services/api/src/database/schema/index.ts",
  out: "./services/api/src/database/migrations",
  strict: true,
  verbose: false,
});
