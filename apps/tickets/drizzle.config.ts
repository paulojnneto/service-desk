import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` to write SQL migrations into ./drizzle (committed).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
