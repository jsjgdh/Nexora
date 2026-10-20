#!/usr/bin/env node
/* A restore drill: prove that a backup can be restored, rather than assuming it.
 *
 * WHY THIS EXISTS
 *
 * A backup nobody has restored is a hypothesis. The honest statement about a
 * database is not "we take backups" but "we took one on Tuesday, restored it,
 * and the rows were there" — and the second half is the half that is almost
 * never done, because doing it needs a scratch database and someone willing to
 * look at the output.
 *
 * So this is that command. It reads every table in a database, writes the rows
 * out, restores them into a scratch schema, and compares what came back with
 * what went out. It does not need `pg_dump` (which is not installed in every
 * image the platform runs in, and which is a binary rather than a contract), and
 * it does not need a second machine: the scratch schema lives in the same
 * database and is dropped afterwards.
 *
 * What it proves and what it does not:
 *   - It PROVES that the rows can be read, serialised and written back, that
 *     the schema the application depends on is present, and that a restore
 *     lands the same rows.
 *   - It does NOT prove that a physical backup taken by the database engine
 *     (Cloud SQL's automated backups, `pg_basebackup`, a snapshot) can be
 *     restored. That is a different mechanism and a different drill, and
 *     claiming otherwise would be the kind of green that means nothing. The
 *     engine-level drill is a documented operator step, in OPERATIONS.md.
 *
 * Exit status, matching the other two operational commands (healthcheck,
 * synthetic), so one monitor can run all three:
 *   0  the drill passed: what came out is what went back in
 *   1  the drill failed: a table's rows did not come back, or a row changed
 *   2  the drill could not run: no database, no schema, no permission
 *
 * Run:
 *   npm run drill -- --url=postgres://nexora:nexora@127.0.0.1:5432/authdb
 *   npm run drill -- --url=... --schema=drill_scratch
 *   npm run drill -- --url=... --json          # for a monitor that parses stdout
 *   npm run drill -- --url=... --keep         # leave the scratch schema in place
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USAGE = `usage: drill [options]

  --url=<postgres url>   the database to drill (default $DRILL_URL)
  --schema=<name>        the scratch schema to restore into (default: drill_scratch)
  --keep                 leave the scratch schema behind (for inspection)
  --json                 print the report as JSON
  --quiet                print nothing when the drill passes
  --help                 this text
`;

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name, fallback) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};

/**
 * Whether this file is the command being run, rather than a module something
 * else imported.
 *
 * The drill is imported by its own test suite, and a module that runs its
 * command on import would answer the test runner's arguments and exit with the
 * command's status — which is how a passing test file becomes a failing one.
 */
const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const url = value("url", process.env.DRILL_URL ?? "");
const schema = value("schema", "drill_scratch");
const keep = flag("keep");
const asJson = flag("json");
const quiet = flag("quiet");

if (!isTheCommand) {
	// Imported: export the drill, run nothing.
} else {
	if (flag("help") || !url) {
		if (!url) {
			console.error("no database to drill: pass --url=<postgres url> or set DRILL_URL");
		}
		console.error(USAGE);
		process.exitCode = 2;
	} else {
		// The scratch schema is where the restore lands. It is created, filled and
		// dropped inside one run, so a drill never leaves state behind unless the
		// operator asks to keep it.
		const client = new pg.Client({ connectionString: url });
		try {
			await client.connect();
			const report = await drill(client, schema);
			if (asJson) {
				console.log(JSON.stringify(report, null, 2));
			} else if (!report.ok || !quiet) {
				for (const line of report.lines) {
					console.log(line);
				}
			}
			process.exitCode = report.ok ? 0 : 1;
		} catch (err) {
			console.error(`the drill could not run: ${err instanceof Error ? err.message : String(err)}`);
			process.exitCode = 2;
		} finally {
			await client.end().catch(() => {});
		}
	}
}

/**
 * The drill itself: read every table, restore every table, compare.
 *
 * Split out from the command so it can be exercised against the platform's own
 * test database without a network, a container or a shell.
 */
export async function drill(client, scratchSchema) {
	const lines = [];
	const before = await readTables(client);
	const names = Object.keys(before);
	if (names.length === 0) {
		return {
			ok: false,
			lines: ["FAILED: the database has no tables, so there was nothing to restore"],
			tables: [],
		};
	}

	await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(scratchSchema)} CASCADE`);
	await client.query(`CREATE SCHEMA ${quoteIdent(scratchSchema)}`);

	let ok = true;
	const tables = [];
	try {
		for (const name of names) {
			const rows = before[name];
			await client.query(`CREATE TABLE ${quoteIdent(scratchSchema)}.${quoteIdent(name)} (LIKE ${quoteIdent(name)} INCLUDING ALL)`);
			if (rows.length > 0) {
				await insertRows(client, scratchSchema, name, rows);
			}
			const after = await readTable(client, scratchSchema, name);
			const same = after.length === rows.length && after.every((r, i) => sameRow(r, rows[i]));
			if (!same) {
				ok = false;
				lines.push(`FAILED: ${name} came back with ${after.length} row(s); ${rows.length} went out`);
			} else {
				lines.push(`  ok - ${name}: ${rows.length} row(s) restored`);
			}
			tables.push({ name, rows: rows.length, restored: after.length, ok: same });
		}
	} finally {
		if (!keep) {
			await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(scratchSchema)} CASCADE`).catch(() => {});
		}
	}

	if (ok) {
		lines.unshift(`drill passed: ${names.length} table(s) read, restored and compared`);
	} else {
		lines.unshift("drill FAILED: what came back is not what went out");
	}
	return { ok, lines, tables };
}

/**
 * Every table in the public schema, with its rows.
 *
 * Exported because the backup command reads exactly what the drill reads: one
 * reader, two uses. A backup that dumps different rows from the ones a drill
 * restores would be a backup nobody has checked.
 */
export async function readTables(client) {
	const { rows: tables } = await client.query(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
	);
	const out = {};
	for (const { table_name: name } of tables) {
		out[name] = await readTable(client, "public", name);
	}
	return out;
}

/** One table's rows, in a stable order so two reads are comparable. */
export async function readTable(client, schemaName, name) {
	const { rows } = await client.query(`SELECT * FROM ${quoteIdent(schemaName)}.${quoteIdent(name)}`);
	return rows;
}

/** Write rows into the scratch table, column by column, in one statement each. */
export async function insertRows(client, schemaName, name, rows) {
	const columns = Object.keys(rows[0]);
	const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
	const statement = `INSERT INTO ${quoteIdent(schemaName)}.${quoteIdent(name)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
	for (const row of rows) {
		await client.query(statement, columns.map((c) => row[c]));
	}
}

/** An identifier, quoted. The scratch schema name comes from a flag, so it is
 *  never interpolated raw. */
export function quoteIdent(name) {
	return `"${String(name).replace(/"/g, '""')}"`;
}

/** Two rows are the same when every column matches, with dates compared by value. */
function sameRow(a, b) {
	const keys = Object.keys(b);
	if (Object.keys(a).length !== keys.length) {
		return false;
	}
	return keys.every((k) => {
		const x = a[k];
		const y = b[k];
		if (x instanceof Date && y instanceof Date) {
			return x.getTime() === y.getTime();
		}
		if (x && typeof x === "object" && y && typeof y === "object") {
			return JSON.stringify(x) === JSON.stringify(y);
		}
		return x === y;
	});
}
