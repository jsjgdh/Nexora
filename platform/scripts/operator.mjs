#!/usr/bin/env node
/* The operator's tooling: the flag, granted and taken away.
 *
 * The panel can grant the operator flag, but it cannot be the first way to
 * get one: a console that could hand itself the right to exist would not be
 * a boundary. So the first operator is granted here, on the machine, by
 * somebody with the database.
 *
 *   node scripts/operator.mjs list
 *   node scripts/operator.mjs grant <email> [--by <email>]
 *   node scripts/operator.mjs revoke <email>
 *
 * It reads the same environment the services run with (platform/.env.local
 * for a local stack), and it applies the operator migration itself, so the
 * first flag can be granted before the service has ever booted.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* The environment the services run with. A local stack writes it, and a
   deployment has it in the process environment already. */
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] === undefined) {
      process.env[key] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.AUTH_DATABASE_URL;
if (!url) {
  console.error("AUTH_DATABASE_URL is not set. Start the local stack, or set it in the environment.");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

/* The operator migration, applied if it is not there yet. The file is
   CREATE TABLE IF NOT EXISTS, so running it again changes nothing. */
async function ensureTables() {
  await pool.query(readFileSync(join(root, "services", "auth", "migrations", "010_admin.sql"), "utf8"));
}

const [command, target, ...rest] = process.argv.slice(2);

function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : null;
}

async function main() {
  await ensureTables();

  if (command === "list") {
    const { rows } = await pool.query(
      "SELECT o.user_id, o.role, o.granted_at, o.granted_by, u.email, u.name FROM operators o JOIN users u ON u.id = o.user_id ORDER BY o.granted_at"
    );
    if (rows.length === 0) {
      console.log("No operators yet.");
      console.log("Grant the first one: node scripts/operator.mjs grant you@example.com");
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.email}\t${r.role}\tgranted ${new Date(r.granted_at).toISOString()}${r.granted_by ? ` by ${r.granted_by}` : ""}`
      );
    }
    return;
  }

  if (command === "grant") {
    if (!target) {
      console.error("Give the address of the account: node scripts/operator.mjs grant you@example.com");
      process.exit(2);
    }
    const email = target.trim().toLowerCase();
    const { rows } = await pool.query("SELECT id, email FROM users WHERE lower(email) = $1", [email]);
    if (rows.length === 0) {
      console.error(`No account with the address ${email}. The person has to have signed up first.`);
      process.exit(1);
    }
    const by = flag("by") ?? null;
    await pool.query(
      "INSERT INTO operators (user_id, role, granted_by) VALUES ($1, 'operator', $2) ON CONFLICT (user_id) DO NOTHING",
      [rows[0].id, by]
    );
    await pool.query(
      "INSERT INTO admin_actions (id, operator_id, action, target, detail) VALUES ($1, $2, 'operator.granted', $3, $4)",
      [randomUUID(), by ?? "tooling", rows[0].id, email]
    );
    console.log(`${email} is an operator.`);
    return;
  }

  if (command === "revoke") {
    if (!target) {
      console.error("Give the address of the account: node scripts/operator.mjs revoke you@example.com");
      process.exit(2);
    }
    const email = target.trim().toLowerCase();
    const removed = await pool.query(
      "DELETE FROM operators WHERE user_id IN (SELECT id FROM users WHERE lower(email) = $1)",
      [email]
    );
    await pool.query(
      "INSERT INTO admin_actions (id, operator_id, action, target, detail) VALUES ($1, 'tooling', 'operator.revoked', $2, $3)",
      [randomUUID(), email, `${removed.rowCount ?? 0} removed`]
    );
    console.log(`${email} is no longer an operator (${removed.rowCount ?? 0} removed).`);
    return;
  }

  console.error("Usage: node scripts/operator.mjs list | grant <email> [--by <email>] | revoke <email>");
  process.exit(2);
}

try {
  await main();
} finally {
  await pool.end();
}
