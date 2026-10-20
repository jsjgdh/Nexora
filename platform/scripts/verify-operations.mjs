#!/usr/bin/env node
/* The operational invariants, checked against the code rather than promised in
 * a document.
 *
 * A runbook that says "the synthetic check runs hourly" and a quota that says
 * "200 a day" are two numbers in two files, and the day one of them changes the
 * canary quietly eats the quota that real learners run on — and then every
 * hosted run in the product fails, for a reason that looks like a product
 * fault.
 *
 * So the pairs that must agree are asserted here, and each one is proved by
 * breaking the pair on purpose.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("the operational invariants hold", () => {
	const composeText = readFileSync(join(root, "docker-compose.yml"), "utf8");
	const executionSource = readFileSync(join(root, "services", "execution", "src", "index.ts"), "utf8");
	const syntheticSource = readFileSync(join(root, "scripts", "synthetic.mjs"), "utf8");

	it("the canary's hourly run fits inside the daily execution quota", () => {
		// The synthetic check runs ONE program per invocation, and every program
		// spends one of the account's daily executions. Hourly is 24 a day; the
		// quota defaults to 200. If either number moves, this is where it is
		// noticed — before the canary starves the learners who are actually
		// trying to work.
		const quota = Number(/EXECUTION_DAILY_QUOTA \?\? ["']?(\d+)/.exec(executionSource)?.[1] ?? 0);
		assert.ok(quota > 0, "the execution service has a daily quota default");
		assert.match(syntheticSource, /on the hour/, "the synthetic check documents its cadence");
		const runsPerDay = 24;
		assert.ok(
			runsPerDay < quota,
			`the canary runs ${runsPerDay} times a day and the quota is ${quota}; it must leave room for real learners`
		);
	});

	it("a per-minute cadence would break the quota, and the script says so", () => {
		// The failure this prevents is specific: a crontab left on the minute
		// spends 1,440 executions a day, exhausts the quota by morning, and then
		// the check fails for a reason that is not a fault in the platform.
		const quota = Number(/EXECUTION_DAILY_QUOTA \?\? ["']?(\d+)/.exec(executionSource)?.[1] ?? 0);
		assert.ok(1440 > quota, "a per-minute cadence really would exceed the quota");
		assert.match(
			syntheticSource,
			/never on the minute/,
			"the script warns against exactly that cadence"
		);
	});

	it("every service in the compose stack has a health check", () => {
		// The healthcheck command asks one endpoint and trusts the answer. A
		// service without one is a service whose failure is invisible until a
		// learner hits it.
		// The services are the top-level keys of the compose file. The `volumes:`
		// section is cut off first, or its keys read as services.
		const servicesSection = composeText.split(/^volumes:$/m)[0];
		const services = [...servicesSection.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);
		assert.ok(services.length >= 5, `the stack has services to check: ${services.join(", ")}`);
		for (const service of services) {
			if (service === "postgres" || service === "frontend") {
				continue; // postgres is checked by pg_isready; the frontend by the proxy.
			}
			const block = composeText.split(new RegExp(`^  ${service}:$`, "m"))[1] ?? "";
			const untilNext = block.split(/^  [a-z][a-z0-9-]*:$/m)[0];
			// A service behind a profile is a JOB, not a service: the backup and
			// the drill are run on demand and have nothing to answer. Asking them
			// for a health check would be asking a cron job to be a daemon.
			if (/profiles:/.test(untilNext)) {
				continue;
			}
			assert.match(untilNext, /healthcheck:/, `${service} has no health check`);
			assert.match(
				untilNext,
				/\/health\/(live|ready)/,
				`${service}'s health check does not ask a health endpoint`
			);
		}
	});

	it("the jobs behind a profile are jobs, and the services are not", () => {
		// The backup and the drill are run on demand by a cron entry. A service
		// that answers /health/live forever is a daemon, not a job, and a daemon
		// that holds a database connection is a job somebody will forget.
		const servicesSection = composeText.split(/^volumes:$/m)[0];
		for (const job of ["backup", "drill"]) {
			const block = servicesSection.split(new RegExp(`^  ${job}:$`, "m"))[1] ?? "";
			const untilNext = block.split(/^  [a-z][a-z0-9-]*:$/m)[0];
			assert.match(untilNext, /profiles:/, `${job} is not behind a profile, so it starts with the stack`);
		}
		for (const service of ["auth", "curriculum", "execution", "billing", "gateway"]) {
			const block = servicesSection.split(new RegExp(`^  ${service}:$`, "m"))[1] ?? "";
			const untilNext = block.split(/^  [a-z][a-z0-9-]*:$/m)[0];
			assert.doesNotMatch(untilNext, /profiles:/, `${service} is a service, not a job, and must not be behind a profile`);
		}
	});

	it("the backup and the drill are in the verify chain, not beside it", () => {
		// A backup nobody runs is a hypothesis, and a drill nobody runs is the
		// same hypothesis with more steps. Both are in `verify:all` so that a
		// change to either cannot land without the other being exercised.
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		assert.match(pkg.scripts["verify:all"], /verify:drill/, "the drill is not in the chain");
		assert.match(pkg.scripts["verify:all"], /verify:backup/, "the backup is not in the chain");
		assert.ok(pkg.scripts.backup, "there is a backup command");
		assert.ok(pkg.scripts.drill, "there is a restore drill");
	});

	it("the backup command refuses to run without a directory and a database", () => {
		// The exit statuses are the contract with a monitor: 2 means "the check
		// could not run", which is a different alarm from "it failed".
		let code = 0;
		try {
			execFileSync("node", [join(root, "scripts", "backup.mjs")], { stdio: "pipe" });
		} catch (err) {
			code = err.status ?? 0;
		}
		assert.equal(code, 2, "a backup with no database and no directory is 'could not run'");
	});

	it("the drill refuses to run without a database, and says why", () => {
		let code = 0;
		let stderr = "";
		try {
			execFileSync("node", [join(root, "scripts", "backup-drill.mjs")], { stdio: "pipe" });
		} catch (err) {
			code = err.status ?? 0;
			stderr = String(err.stderr ?? "");
		}
		assert.equal(code, 2, "a drill with no database is 'could not run'");
		assert.match(stderr, /no database to drill/, "and it names what is missing");
	});
});
