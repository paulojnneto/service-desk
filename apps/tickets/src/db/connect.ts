import { fileURLToPath } from "node:url";
import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

// Both PostgreSQL (server) and PGlite (tests) databases fit this type.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function connect(url: string) {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }) as Db, close: () => pool.end() };
}

// Rows of a raw SQL query. Both drivers return { rows }, but the shared Db type cannot say so.
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

export async function applyMigrations(url: string) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
