#!/usr/bin/env node
/* The monitor, proven.
 *
 * The monitor's job is to notice a change and tell a human, so the things
 * that matter are the two ways it can be wrong:
 *
 *   - it repeats itself (a fault that is already known is not news, and a
 *     monitor that repeats itself gets muted), and
 *   - it stays silent when something has changed (the failure nobody hears
 *     about is the failure nobody fixes).
 *
 * Both are asserted here, along with the message itself: an alert has to name
 * WHICH check failed and what the check said, or it is not an action anybody
 * can take.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeAlert, shouldReport } from "./monitor.mjs";

const healthy = { name: "health", what: "the public edge", code: 0, output: "" };
const broken = { name: "health", what: "the public edge", code: 1, output: "the edge reports degraded" };
const unaskable = { name: "synthetic", what: "the journey a learner walks", code: 2, output: "no reply" };

describe("the monitor reports a change, and only a change", () => {
	it("a first failure is reported", () => {
		const decision = shouldReport(null, [broken]);
		assert.equal(decision.report, true);
		assert.match(decision.reason, /started failing/);
	});

	it("the same failure is not reported again", () => {
		const decision = shouldReport({ failing: ["health"] }, [broken]);
		assert.equal(decision.report, false, "a fault that is already known is not news");
		assert.match(decision.reason, /nothing changed/);
	});

	it("a different set of failing checks IS reported", () => {
		const decision = shouldReport({ failing: ["health"] }, [healthy, unaskable]);
		assert.equal(decision.report, true);
		assert.match(decision.reason, /changed/);
	});

	it("a recovery is reported too, so the channel is not just complaints", () => {
		const decision = shouldReport({ failing: ["health"] }, [healthy]);
		assert.equal(decision.report, true);
		assert.match(decision.reason, /recovered/);
	});

	it("all healthy, and nothing was failing, says nothing", () => {
		const decision = shouldReport({ failing: [] }, [healthy, healthy]);
		assert.equal(decision.report, false);
	});
});

describe("the alert says what happened and what to do", () => {
	it("nothing to say when everything is healthy", () => {
		assert.equal(composeAlert([healthy, healthy]), null);
	});

	it("it names the check that failed", () => {
		const alert = composeAlert([broken]);
		assert.match(alert, /the public edge/);
		assert.match(alert, /the platform says something is wrong/);
	});

	it("a check that could not ask is not reported as a broken product", () => {
		const alert = composeAlert([unaskable]);
		assert.match(alert, /the check could not ask/);
		assert.doesNotMatch(alert, /the platform says something is wrong/);
	});

	it("it carries what the check itself said, because that is the action", () => {
		const alert = composeAlert([broken]);
		assert.match(alert, /the edge reports degraded/);
	});

	it("both kinds of failure are in one message", () => {
		const alert = composeAlert([broken, unaskable]);
		assert.match(alert, /the platform says something is wrong/);
		assert.match(alert, /the check could not ask/);
	});
});
