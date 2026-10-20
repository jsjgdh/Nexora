#!/usr/bin/env node
/* The engine-level restore drill.
 *
 * WHY THIS IS A SEPARATE COMMAND
 *
 * `npm run drill` proves the ROWS come back: it reads a database, restores it
 * into a scratch schema, and compares. That is the platform's own restore
 * path, and it is worth having.
 *
 * It is not the same thing as proving the DATABASE can be restored, and a
 * document that says "we have backups" while meaning the first one is exactly
 * the kind of sentence that survives until the day it is needed. The engine's
 * backup is a different mechanism — a Cloud SQL automated backup, or a
 * `pg_basebackup`, or a disk snapshot — and it can fail in ways the row
 * restore cannot see: the backup was never taken, the backup is corrupt, the
 * backup belongs to a different instance, the credentials in it do not match
 * what the application uses.
 *
 * So this command does the honest thing: it restores the engine's own backup
 * into a NEW instance, drills the restored instance, and reports. It creates a
 * real database instance, which costs real money for the few minutes it is
 * alive, and it deletes it afterwards unless the operator asks to keep it.
 *
 * It refuses to run without `--yes`, because a command that spends money
 * without being asked is a command nobody runs twice.
 *
 * Exit status, matching the other operational commands:
 *   0  the backup restored, and the restored database holds what it should
 *   1  the drill against the restored instance failed — THE BACKUP IS NOT USABLE
 *   2  the drill could not run: no backup, no gcloud, no instance to restore into
 *
 * Run:
 *   npm run drill:engine -- --instance=nexora-postgres --project=nexora-prod
 *   npm run drill:engine -- --instance=... --keep     # keep the restored instance
 *   npm run drill:engine -- --instance=... --json
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const USAGE = `usage: drill:engine [options]

  --instance=<name>   the instance whose backup to restore (required)
  --project=<name>    the GCP project (default $GCP_PROJECT)
  --region=<name>     the region (default $GCP_REGION)
  --database=<name>   the database inside the instance to drill (default: all)
  --keep              keep the restored instance after the drill
  --yes               actually restore it (this creates a real instance)
  --json              print the report as JSON
  --quiet             print nothing when the drill passes
  --help              this text
`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};

const instance = value("instance", process.env.DRILL_INSTANCE ?? "");
const project = value("project", process.env.GCP_PROJECT ?? "");
const region = value("region", process.env.GCP_REGION ?? "us-central1");
const database = value("database", "");
const keep = flag("keep");
const asJson = flag("json");
const quiet = flag("quiet");

/**
 * The most recent automated backup of an instance, or null.
 *
 * The ordering is by creation time, not by name: a backup's name carries a
 * timestamp but the API's is authoritative, and "the newest" is the one an
 * operator would have restored.
 */
export function latestBackup(instanceName, projectName) {
	const out = execFileSync(
		"gcloud",
		[
			"sql", "backups", "list",
			"--instance", instanceName,
			"--project", projectName,
			"--format", "value(name,creationTime)",
		],
		{ encoding: "utf8" }
	);
	const rows = out
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [name, creationTime] = line.split(/\s+/);
			return { name, creationTime: creationTime ? Date.parse(creationTime) : 0 };
		})
		.filter((row) => row.name);
	if (rows.length === 0) {
		return null;
	}
	rows.sort((a, b) => b.creationTime - a.creationTime);
	return rows[0];
}

/** The gcloud commands that restore a backup into a new instance. */
export function restoreCommands(instanceName, backupName, scratchName, projectName, regionName) {
	return [
		{
			label: `restore ${backupName} into ${scratchName}`,
			args: [
				"sql", "instances", "create", scratchName,
				"--source-backup-instance", instanceName,
				"--source-backup-id", backupName,
				"--region", regionName,
				"--project", projectName,
			],
		},
	];
}

/** The gcloud command that waits for an instance to be ready. */
export function readyCommand(scratchName, projectName) {
	return {
		label: `wait for ${scratchName}`,
		args: ["sql", "instances", "describe", scratchName, "--project", projectName, "--format", "value(state)"],
	};
}

/** The gcloud command that removes the scratch instance. */
export function deleteCommand(scratchName, projectName) {
	return {
		label: `remove ${scratchName}`,
		args: ["sql", "instances", "delete", scratchName, "--quiet", "--project", projectName],
	};
}

/** The gcloud command that reads a restored instance's address. */
export function addressCommand(scratchName, projectName) {
	return {
		label: `the address of ${scratchName}`,
		args: ["sql", "instances", "describe", scratchName, "--project", projectName, "--format", "value(ipAddresses[0].ipAddress)"],
	};
}

/** How long to wait for a sleep, without shelling out to `sleep`. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where the row drill lives, next to this file. */
function drillScriptPath() {
	return new URL("./backup-drill.mjs", import.meta.url).pathname.replace(/^\//, "");
}

/** The databases the plan creates, so the drill knows where to look. */
function planDatabases() {
	try {
		const planPath = new URL("../infra/gcp/plan.json", import.meta.url).pathname.replace(/^\//, "");
		const plan = JSON.parse(readFileSync(planPath, "utf8"));
		return plan.database?.databases ?? [];
	} catch {
		return [];
	}
}

/**
 * Whether this file is the command being run, rather than a module something
 * else imported — a test file imports it to check what it would do, and must
 * not spend money because of it.
 */
const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!isTheCommand) {
	// Imported: export the functions, run nothing.
} else if (args.includes("--help") || !instance || !project) {
	if (!instance) {
		console.error("no instance to restore from: pass --instance=<name>");
	}
	if (!project) {
		console.error("no project: pass --project=<name> or set GCP_PROJECT");
	}
	console.error(USAGE);
	process.exitCode = 2;
} else if (!flag("yes")) {
	// It creates a real instance and spends real money, so it is not done
	// behind anyone's back.
	console.error(
		`this will restore the latest backup of ${instance} into a NEW instance in ${project}.\n` +
			"it costs money for as long as the instance is alive, and it is the only way to\n" +
			"know the backup is usable rather than merely present.\n" +
			"re-run with --yes to do it."
	);
	process.exitCode = 2;
} else {
	const scratch = `${instance}-drill`;
	const report = { ok: false, instance, project, backup: null, restored: null, drill: null, lines: [] };

	try {
		const backup = latestBackup(instance, project);
		if (!backup) {
			throw new Error(`there is no automated backup of ${instance} to restore — the instance has never been backed up`);
		}
		report.backup = backup.name;
		report.lines.push(`restoring the backup ${backup.name} of ${instance}`);

		for (const command of restoreCommands(instance, backup.name, scratch, project, region)) {
			execFileSync("gcloud", command.args, { stdio: "inherit" });
		}
		// The restore is asynchronous: the instance comes up READY some minutes
		// later. Polling it is the difference between a drill and a timeout.
		for (let i = 0; i < 60; i++) {
			const state = execFileSync("gcloud", readyCommand(scratch, project).args, { encoding: "utf8" }).trim();
			if (state === "READY") {
				break;
			}
			if (i === 59) {
				throw new Error(`the restored instance ${scratch} did not become ready`);
			}
			await wait(10_000);
		}
		report.restored = scratch;
		report.lines.push(`the restored instance ${scratch} is ready`);

		// The drill itself, against the RESTORED database. This is the part that
		// matters: the same command the platform runs, pointed at the copy the
		// engine produced.
		const address = execFileSync("gcloud", addressCommand(scratch, project).args, { encoding: "utf8" }).trim();
		const password = process.env.RESTORED_DATABASE_PASSWORD ?? "";
		if (!password) {
			throw new Error("RESTORED_DATABASE_PASSWORD is not set, so the drill has nothing to connect with");
		}
		const databaseName = database || (planDatabases()[0] ?? "authdb");
		const url = `postgres://nexora:${encodeURIComponent(password)}@${address}:5432/${databaseName}`;
		const drill = execFileSync(
			"node",
			[drillScriptPath(), `--url=${url}`],
			{ encoding: "utf8" }
		);
		report.drill = drill.trim();
		report.ok = true;
		report.lines.push(`the restored ${databaseName} holds what it should`);
	} catch (err) {
		report.lines.push(`the drill could not be completed: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		if (!keep && report.restored) {
			execFileSync("gcloud", deleteCommand(scratch, project).args, { stdio: "inherit" });
			report.lines.push(`the restored instance ${scratch} was removed`);
		}
	}

	if (asJson) {
		console.log(JSON.stringify(report, null, 2));
	} else if (!report.ok || !quiet) {
		for (const line of report.lines) {
			console.log(`  ${line}`);
		}
	}
	process.exitCode = report.ok ? 0 : 1;
}
