import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./connect";
import * as schema from "./schema";

// A fresh in-process PostgreSQL (PGlite) with the real migrations, for tests.
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

// Empties every table: cheaper than migrating a new database for each test.
export async function resetTestDb(db: Db) {
  await db.execute(
    sql`truncate decisions, drafts, messages, conversations, sessions restart identity cascade`,
  );
}
