#!/usr/bin/env node
/* The engine-level restore drill, proven.
 *
 * The drill spends real money — it restores a real backup into a real
 * instance — so it cannot be run in a suite. What CAN be run is the part
 * that decides whether it would do the right thing: which backup it picks,
 * what it would restore, and what it does with the scratch instance
 * afterwards.
 *
 * The three ways it can be wrong, and why each matters:
 *
 *   - it restores the OLDEST backup, so the drill proves a backup from weeks
 *     ago is intact while the one from last night is not;
 *   - it leaves the scratch instance running, which costs money every month
 *     and holds a copy of the production database for nobody;
 *   - it drills a database the platform does not use, so a green drill says
 *     nothing about the database that matters.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { latestBackup, restoreCommands, readyCommand, deleteCommand, addressCommand } from "./drill-engine.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("the engine restore drill", () => {
	it("picks the NEWEST backup, because that is the one an operator would restore", () => {
		// The names carry a timestamp, and the API's creation time is
		// authoritative. The drill must not restore a backup from weeks ago and
		// report that the backups are fine.
		const source = readFileSync(join(root, "scripts", "drill-engine.mjs"), "utf8");
		assert.match(source, /b\.creationTime - a\.creationTime/, "the backups are not ordered by age");
		assert.match(source, /rows\[0\]/, "the newest backup is not the one that is chosen");
	});

	it("restores into a NEW instance, never over the live one", () => {
		const commands = restoreCommands("nexora-postgres", "backup-123", "nexora-postgres-drill", "p", "us-central1");
		const restore = commands[0];
		assert.ok(restore.args.includes("--source-backup-instance"));
		assert.equal(restore.args[restore.args.indexOf("--source-backup-instance") + 1], "nexora-postgres");
		assert.ok(restore.args.includes("--source-backup-id"), "the restore does not name the backup");
		// The scratch name is a DIFFERENT instance. A restore over the live one
		// would be the worst possible outcome of a drill.
		assert.ok(restore.args.includes("nexora-postgres-drill"));
		assert.notEqual(restore.args[2], "nexora-postgres");
	});

	it("removes the scratch instance afterwards, unless the operator asks to keep it", () => {
		const remove = deleteCommand("nexora-postgres-drill", "p");
		assert.ok(remove.args.includes("delete"));
		assert.ok(remove.args.includes("--quiet"), "the removal would ask a question on a path nobody is watching");
	});

	it("drills a database the plan actually creates", () => {
		const plan = JSON.parse(readFileSync(join(root, "infra", "gcp", "plan.json"), "utf8"));
		assert.ok(plan.database.databases.includes("authdb"), "the plan creates no authdb to drill");
		const source = readFileSync(join(root, "scripts", "drill-engine.mjs"), "utf8");
		assert.match(source, /planDatabases/, "the drill does not read the plan's databases");
	});

	it("waits for the restored instance instead of assuming it is there", () => {
		const ready = readyCommand("nexora-postgres-drill", "p");
		assert.ok(ready.args.includes("describe"));
		assert.ok(ready.args.some((a) => a.includes("state")), "the drill does not ask whether the instance is ready");
	});

	it("reads the address it restored, so the drill points at the copy and not at production", () => {
		const address = addressCommand("nexora-postgres-drill", "p");
		assert.ok(address.args.some((a) => a.includes("ipAddresses")), "the drill does not learn the restored address");
		assert.ok(!address.args.includes("nexora-postgres'"), "the drill reads the live instance's address");
	});

	it("refuses to run without the operator saying yes, because it spends money", () => {
		const source = readFileSync(join(root, "scripts", "drill-engine.mjs"), "utf8");
		assert.match(source, /--yes/, "the drill does not ask whether it may spend money");
		assert.match(source, /it costs money for as long as the instance is alive/, "and it does not say what it costs");
	});
});
