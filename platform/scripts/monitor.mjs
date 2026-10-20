#!/usr/bin/env node
/* The thing that pages someone.
 *
 * WHY THIS EXISTS
 *
 * The platform has two checks that answer with an exit status — `healthcheck`
 * for the edge, `synthetic` for the journey a learner walks — and a runbook
 * that says, honestly, that "there is no alerting system in this stack yet" and
 * that `docker logs` plus those commands are the whole of production
 * visibility. A command nobody watches is a command that runs on a schedule and
 * is read by nobody, which is the same as not running it.
 *
 * So this is the missing third piece: it runs the checks, and when one fails
 * it tells a human. Not loudly, and not often: an outage that lasts an hour
 * should be ONE message, not sixty. So the monitor remembers what it last
 * reported and only speaks when the state CHANGES — a fault that begins, and a
 * fault that ends. The second one matters as much as the first: a monitor that
 * only complains is a monitor people mute.
 *
 * It sends through Resend, which the platform already has an account with for
 * password resets — no new provider, no new bill, and the mail path is the
 * same one the auth service already uses.
 *
 * Exit status, matching the other operational commands:
 *   0  everything is healthy, or the fault has already been reported
 *   1  a check failed and this run reported it
 *   2  the monitor could not run: no check to make, or no way to report
 *
 * Run:
 *   npm run monitor
 *   npm run monitor -- --json          # for a monitor that parses stdout
 *   npm run monitor -- --dry-run        # report what would be sent, send nothing
 *
 * Environment:
 *   MONITOR_TO          where an alert goes (required to alert)
 *   RESEND_API_KEY      the provider key
 *   RESEND_FROM         the sender
 *   MONITOR_STATE       where the "what did I last report" file lives
 *                       (default: .monitor-state.json)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESEND_ENDPOINT = "https://api.resend.com/emails";

const USAGE = `usage: monitor [options]

  --json           print the report as JSON
  --dry-run        say what would be sent, send nothing
  --quiet          print nothing when everything is healthy
  --help           this text
`;

/**
 * The checks, in the order they should be run.
 *
 * The edge first: it is cheap, it answers in a second, and it distinguishes
 * "the gateway is down" from "the gateway is up and something behind it is
 * not". The journey second, because it is the one that tells you a LEARNER is
 * affected rather than that a component is unhappy.
 */
const CHECKS = [
	{ name: "health", script: "healthcheck.mjs", what: "the public edge" },
	{ name: "synthetic", script: "synthetic.mjs", what: "the journey a learner walks" },
];

/**
 * Run one check and report what it said.
 *
 * The check's own exit status is the answer, and it is kept: 0 healthy, 1 the
 * platform says something is wrong, 2 the check could not ask. Collapsing 1 and
 * 2 into one number would lose the difference between "the product is broken"
 * and "I cannot tell", which is the difference between waking someone and
 * filing a ticket.
 */
export function runCheck(check) {
	try {
		const out = execFileSync("node", [path.join(HERE, check.script)], { encoding: "utf8", timeout: 120_000 });
		return { name: check.name, what: check.what, code: 0, output: out.trim() };
	} catch (err) {
		const code = err.status ?? 2;
		const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
		return { name: check.name, what: check.what, code, output };
	}
}

/**
 * What the monitor should say, given the checks.
 *
 * A fault is a check that did not exit 0. The message says WHICH check, what
 * it means, and what the check itself said — because "the synthetic check
 * failed" is not an action anyone can take, and "the gateway answers 503 on
 * /health/deep" is.
 */
export function composeAlert(results) {
	const failed = results.filter((r) => r.code !== 0);
	if (failed.length === 0) {
		return null;
	}
	const lines = ["The NEXORA platform failed a check.", ""];
	for (const result of failed) {
		lines.push(
			result.code === 1
				? `* ${result.what} (${result.name}): the platform says something is wrong.`
				: `* ${result.what} (${result.name}): the check could not ask.`
		);
	}
	const detail = failed.map((r) => r.output).filter(Boolean).join("\n\n");
	if (detail) {
		lines.push("", "What the checks said:", detail);
	}
	lines.push("", "The health check distinguishes a platform that is wrong from a platform that cannot be reached; both are here.");
	return lines.join("\n");
}

/**
 * Whether this run is worth reporting.
 *
 * A fault that is already known is not news. So the monitor remembers the
 * state it last reported and speaks only on a change: a new fault, or a fault
 * that has ENDED. The second is the one that stops people muting the channel.
 */
export function shouldReport(previous, results) {
	const failing = results.filter((r) => r.code !== 0).map((r) => r.name).sort();
	const before = (previous?.failing ?? []).slice().sort();
	const started = failing.length > 0 && before.length === 0;
	const changed = failing.length > 0 && before.length > 0 && failing.join(",") !== before.join(",");
	const recovered = failing.length === 0 && before.length > 0;
	if (!started && !changed && !recovered) {
		return { report: false, reason: "nothing changed since the last run", state: { failing } };
	}
	return {
		report: true,
		reason: started ? "a check started failing" : changed ? "the set of failing checks changed" : "every check recovered",
		state: { failing },
	};
}

/** Send one message through Resend. Returns whether it went. */
export async function send(to, subject, text) {
	const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
	const from = (process.env.RESEND_FROM ?? "").trim();
	if (!apiKey || !from) {
		return { sent: false, reason: "RESEND_API_KEY or RESEND_FROM is not configured" };
	}
	try {
		const res = await fetch(RESEND_ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
			body: JSON.stringify({ from, to: [to], subject, text }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			return { sent: false, reason: `the provider answered ${res.status}` };
		}
		return { sent: true, reason: null };
	} catch (err) {
		return { sent: false, reason: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Whether this file is the command being run, rather than a module something
 * else imported.
 *
 * The comparison is against this file's OWN path, exactly. A looser test —
 * "does the name end with monitor.mjs" — is true for a file called
 * verify-monitor.mjs, and a test file that imports the module then runs the
 * command as a side effect of the import.
 */
const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

if (!isTheCommand) {
	// Imported: export the functions, run nothing.
} else if (args.includes("--help")) {
	console.error(USAGE);
	process.exitCode = 2;
} else {
	const statePath = process.env.MONITOR_STATE ?? path.join(HERE, ".monitor-state.json");
	let previous = null;
	try {
		previous = JSON.parse(fs.readFileSync(statePath, "utf8"));
	} catch {
		previous = null;
	}

	const results = CHECKS.map(runCheck);
	const decision = shouldReport(previous, results);
	const alert = composeAlert(results);
	const healthy = results.every((r) => r.code === 0);

	// The state is written whatever happens, because the point of it is to
	// remember what the LAST run reported — including a run that could not
	// send its message.
	try {
		fs.writeFileSync(statePath, JSON.stringify(decision.state ?? { failing: [] }, null, 2));
	} catch {
		// A state file that cannot be written means every run looks like the
		// first one, so the monitor will repeat itself. That is annoying, not
		// dangerous, and it is not a reason to fail the run.
	}

	const report = {
		ok: healthy && !decision.report,
		healthy,
		results,
		report: decision.report,
		reason: decision.reason,
		alert,
	};

	if (flag("--json")) {
		console.log(JSON.stringify(report, null, 2));
	} else if (!healthy || decision.report) {
		for (const result of results) {
			const mark = result.code === 0 ? "ok  " : result.code === 1 ? "FAIL" : "????";
			console.log(`  ${mark} ${result.name}: ${result.code === 0 ? "healthy" : result.output.split("\n")[0]}`);
		}
		if (decision.report) {
			console.log(`  ${healthy ? "recovered" : "reporting"}: ${decision.reason}`);
		}
	} else if (!flag("--quiet")) {
		console.log("  ok   everything is healthy");
	}

	if (decision.report && alert) {
		const to = (process.env.MONITOR_TO ?? "").trim();
		if (!to) {
			if (!flag("--quiet")) {
				console.log("  note  MONITOR_TO is not set, so nobody was told");
			}
		} else if (flag("--dry-run")) {
			console.log(`  note  would have sent to ${to}:`);
			console.log(alert);
		} else {
			const subject = healthy
				? "NEXORA: every check is healthy again"
				: "NEXORA: the platform failed a check";
			const sent = await send(to, subject, alert);
			if (!sent.sent) {
				console.error(`the alert did not go out: ${sent.reason}`);
				process.exitCode = 2;
			} else if (!flag("--quiet")) {
				console.log(`  sent  ${subject} to ${to}`);
			}
		}
	}

	if (!healthy && !decision.report) {
		// The fault is known and already reported. Still a failure, so a cron
		// that only looks at the exit status sees it.
		process.exitCode = 1;
	} else if (process.exitCode === undefined) {
		process.exitCode = 0;
	}
}
