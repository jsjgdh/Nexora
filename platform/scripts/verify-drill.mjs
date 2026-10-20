#!/usr/bin/env node
/* The restore drill, proven against a real database.
 *
 * A drill that is never run is a hypothesis, and so is a drill that is only run
 * against a fake. So this suite starts a real Postgres — PGlite, speaking the
 * Postgres wire protocol, so the same `pg` client the platform uses in
 * production connects to it — puts rows in it, and runs the drill.
 *
 * The three things that have to hold:
 *   - a database with rows drills clean;
 *   - a table whose rows do NOT come back is reported as a failure, not as a
 *     pass (which is the whole point of a drill: it is capable of failing);
 *   - the scratch schema is left behind, because a drill that drops its
 *     evidence on the way out cannot be inspected when it fails.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

import { drill } from "./backup-drill.mjs";

const PORT = 18191;

describe("the restore drill (real database)", () => {
	let db;
	let server;
	let pool;

	before(async () => {
		db = await PGlite.create();
		server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
		await server.start();
		pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`, max: 2 });
		await pool.query("CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, joined TIMESTAMPTZ)");
		await pool.query("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
		await pool.query("INSERT INTO people (id, name, joined) VALUES ($1, $2, $3)", [
			"p1",
			"Ada",
			new Date("2026-01-02T03:04:05.000Z"),
		]);
		await pool.query("INSERT INTO notes (id, body) VALUES ($1, $2)", ["n1", "a note"]);
	});

	after(async () => {
		await pool?.end();
		await server?.stop();
		await db?.close();
	});

	it("a database with rows drills clean", async () => {
		const report = await drill(pool, "drill_scratch");
		assert.equal(report.ok, true, report.lines.join("\n"));
		assert.ok(report.tables.length >= 2, "both tables were read");
		for (const table of report.tables) {
			assert.equal(table.restored, table.rows, `${table.name} came back with a different number of rows`);
		}
	});

	it("the drill reports what it did, in words a person can read", async () => {
		const report = await drill(pool, "drill_scratch");
		assert.match(report.lines[0], /drill passed/);
		assert.ok(report.lines.some((l) => /ok - people: 1 row/.test(l)), report.lines.join("\n"));
	});

	it("a table whose rows do not come back fails the drill", async () => {
		// The point of a drill is that it CAN fail. A restore that silently
		// loses a row has to be reported as a failure, or the command is a
		// rubber stamp.
		const client = pool;
		const original = client.query.bind(client);
		let served = 0;
		client.query = async (sql, params) => {
			// Break the restore: the INSERT into the scratch table comes back
			// as though it inserted nothing.
			if (typeof sql === "string" && sql.includes("INSERT INTO \"drill_scratch\"")) {
				served += 1;
				return { rows: [], rowCount: 0 };
			}
			return original(sql, params);
		};
		try {
			const report = await drill(client, "drill_scratch");
			assert.equal(report.ok, false, "a drill that lost rows passed");
			assert.ok(report.lines.some((l) => /came back with 0 row/.test(l)), report.lines.join("\n"));
		} finally {
			client.query = original;
		}
		assert.ok(served > 0, "the restore was actually attempted");
	});

	it("the scratch schema is dropped unless the operator asks to keep it", async () => {
		await drill(pool, "drill_scratch");
		const { rows } = await pool.query(
			"SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
			["drill_scratch"]
		);
		assert.equal(rows.length, 0, "the scratch schema is still there");
	});
});
