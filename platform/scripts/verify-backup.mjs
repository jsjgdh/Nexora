#!/usr/bin/env node
/* The backup, proven against a real database.
 *
 * A backup is a claim, and the claim is only worth something if the restore
 * has been run. So this suite takes a real backup of a real database, restores
 * it into a scratch one, and compares — and it proves the failure modes too,
 * because a backup command that cannot fail is a rubber stamp.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

import { doBackup, doRestore, listDumps, rotate } from "./backup.mjs";

const PORT = 18192;

describe("the backup (real database)", () => {
	let db;
	let server;
	let pool;
	let dir;

	before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-backup-"));
		db = await PGlite.create();
		server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
		await server.start();
		pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`, max: 2 });
		await pool.query("CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)");
		await pool.query("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
		await pool.query("INSERT INTO people (id, name) VALUES ($1, $2)", ["p1", "Ada"]);
		await pool.query("INSERT INTO notes (id, body) VALUES ($1, $2)", ["n1", "a note"]);
	});

	after(async () => {
		await pool?.end();
		await server?.stop();
		await db?.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("a backup writes a dump that says what it took", async () => {
		// The parentheses matter: `await doBackup(...)()` would parse as
		// `await (doBackup(...)())` — calling the PROMISE — and fail with
		// "is not a function", which reads like the wrong export.
		(await doBackup(`postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`, dir))();
		const dumps = listDumps(dir);
		assert.equal(dumps.length, 1, "one dump was written");
		assert.ok(dumps[0].bytes > 0, "the dump is not empty");
		assert.equal(dumps[0].manifest.tables.people, 1, "the manifest says how many rows each table had");
		assert.equal(dumps[0].manifest.tables.notes, 1);
		assert.ok(dumps[0].manifest.takenAt, "the manifest says when it was taken");
	});

	it("a restore puts the rows back", async () => {
		await pool.query("DELETE FROM people");
		await pool.query("DELETE FROM notes");
		const { rows: before } = await pool.query("SELECT count(*) AS n FROM people");
		assert.equal(Number(before[0].n), 0, "the table is empty before the restore");

		const dumps = listDumps(dir);
		(await doRestore(dumps[0].file, `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`))();

		const { rows: after } = await pool.query("SELECT count(*) AS n FROM people");
		assert.equal(Number(after[0].n), 1, "the row came back");
		const { rows: named } = await pool.query("SELECT name FROM people WHERE id = $1", ["p1"]);
		assert.equal(named[0].name, "Ada", "and it is the right row");
	});

	it("dumps older than the window are rotated away, and newer ones are kept", async () => {
		const old = path.join(dir, "backup-2000-01-01T00-00-00-000Z.json.gz");
		fs.copyFileSync(listDumps(dir)[0].file, old);
		fs.utimesSync(old, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));

		const removed = rotate(dir, 14);
		assert.ok(removed.includes(old), "the old dump was removed");
		assert.ok(!fs.existsSync(old), "and it is not on the disk afterwards");
		assert.equal(listDumps(dir).length, 1, "the current dump is still there");
	});

	it("a restore of a file that is not there fails, and says so", async () => {
		await assert.rejects(
			() => doRestore(path.join(dir, "not-a-dump.json.gz"), `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`),
			/there is no dump/,
			"a missing dump is named, not a crash"
		);
	});
});
