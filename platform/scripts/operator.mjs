#!/usr/bin/env node
/* The operator's tooling: the flag, granted and taken away.
 *
 * The panel can grant the operator flag, but it cannot be the first way to
 * get one: a console that could hand itself the right to exist would not be
 * a boundary. So the first operator is granted here, on the machine, by
 * somebody with the database.
 *
 *   node scripts/operator.mjs list
 *   node scripts/operator.mjs grant <email> [--by <email>] [--super] [--days N]
 *   node scripts/operator.mjs revoke <email>
 *
 * The tooling is the root of trust: it is the only way to make a super
 * operator, and the only way to grant a flag that does not end. It reads the
 * same environment the services run with, and it applies the operator
 * migration itself, so the first flag can be granted before the service has
 * ever booted.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* The environment the services run with.
 *
 * The environment is the source of truth: a deployment has it, and the
 * tooling reads it. The local file is a convenience for a machine running
 * the local stack, and it never overrides what the environment already
 * says, so a deployment cannot be pointed at the wrong database by a file
 * that happens to be lying around. */
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

/* The identity database. A deployment names it in the environment; a local
   stack writes it into the file above. */
const url = process.env.AUTH_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "No database address. Set AUTH_DATABASE_URL (or DATABASE_URL) in the environment of the service, and run this where that environment is."
  );
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
      "SELECT o.user_id, o.role, o.granted_at, o.granted_by, o.expires_at, u.email, u.name FROM operators o JOIN users u ON u.id = o.user_id ORDER BY o.granted_at"
    );
    if (rows.length === 0) {
      console.log("No operators yet.");
      console.log("Grant the first one: node scripts/operator.mjs grant you@example.com --super");
      return;
    }
    for (const r of rows) {
      const ends = r.expires_at ? new Date(r.expires_at).toISOString() : "no end";
      const live = !r.expires_at || new Date(r.expires_at).getTime() > Date.now();
      console.log(
        `${r.email}\t${r.role}\t${live ? "live" : "ended"}\tends ${ends}\tgranted ${new Date(r.granted_at).toISOString()}${r.granted_by ? ` by ${r.granted_by}` : ""}`
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
    const role = rest.includes("--super") ? "super" : "operator";
    const days = flag("days") ? Number(flag("days")) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      console.error("--days must be a whole number of days, between 1 and 365.");
      process.exit(2);
    }
    const expiresAt = days === null ? null : new Date(Date.now() + days * 24 * 3600_000);
    const granted = await pool.query(
      "INSERT INTO operators (user_id, role, granted_by, expires_at) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (user_id) DO NOTHING RETURNING user_id",
      [rows[0].id, role, by, expiresAt]
    );
    if (granted.rowCount === 0) {
      console.log(`${email} is already an operator. Nothing changed.`);
      return;
    }
    await pool.query(
      "INSERT INTO admin_actions (id, operator_id, action, target, detail) VALUES ($1, $2, 'operator.granted', $3, $4)",
      [randomUUID(), by ?? "tooling", rows[0].id, `${role}${expiresAt ? ` for ${days} days` : " with no end"}`]
    );
    console.log(
      `${email} is an ${role}${expiresAt ? ` until ${expiresAt.toISOString()}` : " with no end"}.`
    );
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
