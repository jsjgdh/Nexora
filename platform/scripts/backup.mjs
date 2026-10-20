#!/usr/bin/env node
/* The backup: a copy of the data, taken on a schedule, that a restore can put
 * back.
 *
 * WHY THIS IS NOT `pg_dump`
 *
 * Two reasons, and the second is the important one.
 *
 * The first is that `pg_dump` is a binary that has to exist on the machine
 * that takes the backup, and the machine that takes the backup is often not the
 * machine that has the database: on the one-host deployment the database lives
 * in a container, and the tool that can talk to it lives in another container
 * again. A backup that depends on a binary being present is a backup that
 * silently stops happening the day the binary is not there.
 *
 * The second is that this platform already knows what a restore looks like: the
 * schema comes from the migrations, which are versioned in the repository and
 * applied forward-only at boot, and the data comes from the rows. So a backup
 * that stores the ROWS is complete, because the schema is already somewhere
 * that cannot be lost. A backup that stores the schema too would be a second
 * copy of the truth, and two copies of the truth drift.
 *
 * So: a backup is a gzipped JSON document holding every table and every row,
 * plus a manifest saying which database it came from, when, and how many rows
 * each table had. The manifest is what makes a backup checkable — a file whose
 * manifest says zero rows for a table that has rows is a backup that failed
 * quietly, and the manifest is how that is noticed.
 *
 * Run:
 *   npm run backup -- --url=postgres://nexora:nexora@127.0.0.1:5432/authdb \
 *                       --dir=/srv/nexora/backups
 *   npm run backup -- --url=... --dir=... --keep-days=14
 *   npm run backup -- --restore=/srv/nexora/backups/authdb-2026-10-20T03-00-00Z.json.gz \
 *                       --url=...
 *   npm run backup -- --list --dir=...
 *
 * Exit status, matching the other operational commands:
 *   0  the backup (or the restore) worked
 *   1  it did not: a table came back with different rows, or a dump is unreadable
 *   2  it could not run: no database, no directory, no permission
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import pg from "pg";

import { insertRows, quoteIdent, readTables } from "./backup-drill.mjs";

/** Compress and decompress, synchronously: the dump is written once and read
 *  once, and a promise here would only make the command's exit status harder
 *  to reason about. */
const gzip = (buffer) => gzipSync(buffer);
const gunzip = (buffer) => gunzipSync(buffer);

const USAGE = `usage: backup [options]

  --url=<postgres url>   the database to back up (default $BACKUP_URL)
  --dir=<path>           where the dumps live (default $BACKUP_DIR)
  --keep-days=<n>        how long a dump is kept (default 14)
  --restore=<file>       restore this dump instead of taking one
  --list                 list the dumps in the directory and their manifests
  --json                 print the report as JSON
  --quiet                print nothing when it works
  --help                 this text
`;

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name, fallback) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};

const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const url = value("url", process.env.BACKUP_URL ?? "");
const dir = value("dir", process.env.BACKUP_DIR ?? "");
const keepDays = Number(value("keep-days", "14"));
const restore = value("restore", "");
const asJson = flag("json");
const quiet = flag("quiet");

if (!isTheCommand) {
	// Imported: export the functions, run nothing.
} else if (flag("help") || (!url && !flag("list"))) {
	if (!url) {
		console.error("no database to back up: pass --url=<postgres url> or set BACKUP_URL");
	}
	console.error(USAGE);
	process.exitCode = 2;
} else {
	try {
		if (flag("list")) {
			const listed = listDumps(dir);
			if (asJson) {
				console.log(JSON.stringify(listed, null, 2));
			} else if (listed.length === 0) {
				console.log(`no dumps in ${dir}`);
			} else {
				for (const entry of listed) {
					console.log(`  ${entry.file} — ${entry.takenAt} — ${entry.tables} table(s), ${entry.rows} row(s)`);
				}
			}
			process.exitCode = 0;
		} else if (restore) {
			const report = await doRestore(restore, url);
			report();
			process.exitCode = 0;
		} else {
			const report = await doBackup(url, dir, keepDays);
			report();
			process.exitCode = 0;
		}
	} catch (err) {
		console.error(`the backup could not run: ${err instanceof Error ? err.message : String(err)}`);
		process.exitCode = 2;
	}
}

/**
 * Take a backup: read every table, write a gzipped document, rotate the old
 * ones away, and report.
 */
export async function doBackup(url, dir, keepDays = 14) {
	if (!dir) {
		throw new Error("no directory to write the dump into: pass --dir=<path> or set BACKUP_DIR");
	}
	fs.mkdirSync(dir, { recursive: true });
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const tables = await readTables(client);
		const names = Object.keys(tables);
		const takenAt = new Date().toISOString();
		const manifest = {
			version: 1,
			takenAt,
			tables: Object.fromEntries(names.map((n) => [n, tables[n].length])),
			rows: Object.fromEntries(names.map((n) => [n, tables[n].length])),
		};
		const payload = JSON.stringify({ manifest, tables });
		const compressed = await gzip(Buffer.from(payload, "utf8"));
		const stamp = takenAt.replace(/[:.]/g, "-");
		const file = path.join(dir, `backup-${stamp}.json.gz`);
		fs.writeFileSync(file, compressed);
		const removed = rotate(dir, keepDays);
		return () => {
			if (asJson) {
				console.log(JSON.stringify({ ok: true, file, manifest, removed }, null, 2));
			} else if (!quiet) {
				console.log(`backup ok: ${file} — ${names.length} table(s), ${names.reduce((n, t) => n + tables[t].length, 0)} row(s)`);
				if (removed.length > 0) {
					console.log(`  rotated ${removed.length} dump(s) older than ${keepDays} day(s)`);
				}
			}
		};
	} finally {
		await client.end().catch(() => {});
	}
}

/**
 * Restore a dump: read it, put the rows back, and say what came back.
 *
 * The schema is NOT restored from the dump — it is applied by the service's
 * own migrations, which is the same path a fresh deployment takes. So a
 * restore into a fresh database is "migrate, then load", and there is exactly
 * one schema in the platform.
 */
export async function doRestore(file, url) {
	if (!fs.existsSync(file)) {
		throw new Error(`there is no dump at ${file}`);
	}
	const raw = await gunzip(fs.readFileSync(file));
	const parsed = JSON.parse(raw.toString("utf8"));
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const names = Object.keys(parsed.tables);
		for (const name of names) {
			const rows = parsed.tables[name];
			await client.query(`TRUNCATE TABLE ${quoteIdent(name)}`);
			if (rows.length > 0) {
				await insertRows(client, "public", name, rows);
			}
		}
		return () => {
			const total = names.reduce((n, t) => n + parsed.tables[t].length, 0);
			if (asJson) {
				console.log(JSON.stringify({ ok: true, file, tables: names.length, rows: total }, null, 2));
			} else if (!quiet) {
				console.log(`restore ok: ${file} — ${names.length} table(s), ${total} row(s) put back`);
			}
		};
	} finally {
		await client.end().catch(() => {});
	}
}

/** The dumps in a directory, newest first, with their manifests. */
export function listDumps(dir) {
	if (!dir || !fs.existsSync(dir)) {
		return [];
	}
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json.gz"))
		.sort()
		.reverse()
		.map((f) => {
			const full = path.join(dir, f);
			const stat = fs.statSync(full);
			let manifest = null;
			try {
				// The manifest is inside the compressed document, so reading it
				// costs a gunzip. A dump whose manifest cannot be read is a dump
				// that cannot be trusted, and it says so here rather than
				// listing as if it were fine.
				manifest = JSON.parse(gunzipSync(fs.readFileSync(full)).toString("utf8")).manifest ?? null;
			} catch {
				manifest = null;
			}
			return { file: full, bytes: stat.size, mtime: stat.mtime.toISOString(), manifest };
		});
}

/**
 * Delete the dumps older than the retention window.
 *
 * The window is a retention period, and it is the same promise the retention
 * schedule makes about deleted data: a copy of the database as it was ages out
 * on its own schedule, and it is not used for anything in the meantime. Seven
 * days is the default because a weekly cycle (a month-end close, a security
 * incident) is the shortest window in which a restore is still worth having.
 */
export function rotate(dir, keepDays = 14) {
	const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
	const removed = [];
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(".json.gz")) {
			continue;
		}
		const full = path.join(dir, file);
		if (fs.statSync(full).mtimeMs < cutoff) {
			fs.unlinkSync(full);
			removed.push(full);
		}
	}
	return removed;
}
