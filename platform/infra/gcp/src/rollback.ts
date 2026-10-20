/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Putting the platform back on the image it was on before.
 *
 * A rollback that is written down and never run is a wish. A rollback that
 * runs against a remembered image is a guess, and a guess about which build
 * was running is the kind of guess that rolls back to the build that broke.
 *
 * So the image is READ from the Cloud Run API before the deploy changes it,
 * and the rollback is a redeploy of exactly that address. The address is
 * immutable, because the deploy only ever puts an immutable tag on a service.
 */

import type { ICommand } from './command.js';
import type { IPlan } from './plan.js';

/**
 * The command that reads the image a service is running.
 *
 * It reads the spec, not the status, because the status URL is not the image
 * and reading it would answer a different question.
 */
export function runningImageCommand(
	service: string,
	region: string,
	project: string
): ICommand {
	return {
		label: `read the image ${service} is running`,
		args: [
			'run', 'services', 'describe', service,
			'--region', region,
			'--project', project,
			'--format', 'value(spec.template.spec.containers[0].image)',
		],
	};
}

/**
 * The commands that put every service back on one image.
 *
 * Only the image changes. The environment, the secrets and the scaling
 * settings are left as they are, because a rollback is a rollback of the
 * code and not of the configuration: the configuration the previous revision
 * ran with is the configuration that is still there.
 */
export function rollbackCommands(plan: IPlan, image: string): ICommand[] {
	return plan.services.map(planned => ({
		label: `roll ${planned.name} back to ${image}`,
		args: [
			'run', 'services', 'update', planned.name,
			'--image', image,
			'--region', plan.region,
			'--project', plan.project,
			'--quiet',
		],
	}));
}

/**
 * Why a rollback cannot be run, in words.
 *
 * Empty means it can. The first one is the one that matters: a rollback to
 * the moving tag is a rollback to whatever the tag points at now, which is
 * the image that broke.
 */
export function rollbackBlockers(plan: IPlan, image: string): string[] {
	const blockers: string[] = [];
	const trimmed = image.trim();
	if (!trimmed) {
		blockers.push('no image to roll back to');
		return blockers;
	}
	const repository = `${plan.region}-docker.pkg.dev/${plan.project}/${plan.artifactRegistry}/${plan.image.repository}`;
	if (!trimmed.startsWith(`${repository}:`)) {
		blockers.push(
			`the image to roll back to ("${trimmed}") is not in the plan's registry (${repository})`
		);
		return blockers;
	}
	if (trimmed.endsWith(`:${plan.image.movingTag}`)) {
		blockers.push(
			`the image to roll back to ("${trimmed}") carries the moving tag; a rollback has to name a build`
		);
	}
	return blockers;
}
