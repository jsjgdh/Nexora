import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

/* Shared Postgres helpers: pool, ordered SQL migrations, ids, hashing. */

export function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing required env DATABASE_URL");
  return new Pool({ connectionString: url, max: 10 });
}

/** Ordered migration runner over a directory of *.sql files. */
export async function migrate(pool: Pool, migrationsDir: string): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const done = new Set((rows as { version: string }[]).map((r) => r.version));
    for (const f of files) {
      const version = f.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      const sql = await readFile(join(migrationsDir, f), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        applied.push(version);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

export function newId(): string {
  return randomUUID();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
