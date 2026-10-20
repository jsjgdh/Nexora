/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Check the Google Cloud plan against the source tree, and say what is wrong.
 *
 * A separate entry point so the check can be run on its own — in CI, in a
 * pre-commit hook, or by a person who wants to know whether the plan still
 * describes the code — without touching a project.
 *
 * Run:  node infra/gcp/dist/plan-check.js
 */

import { planBlockers, readPlan } from './plan.js';

const plan = readPlan();
const blockers = planBlockers(plan);

if (blockers.length > 0) {
	console.error('REFUSING TO DEPLOY: the plan does not match the code it claims to deploy.');
	for (const reason of blockers) {
		console.error(`  - ${reason}`);
	}
	process.exit(1);
}

console.log(
	`plan ok: ${plan.services.length} services, ${plan.secrets.length} secrets, ` +
	`${plan.database.databases.length} databases, project ${plan.project} in ${plan.region}.`
);
for (const service of plan.services) {
	console.log(`  ${service.name.padEnd(22)} ${service.service.padEnd(12)} ${service.ingress}`);
}
