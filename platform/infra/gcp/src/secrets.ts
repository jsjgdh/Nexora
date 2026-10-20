/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The secret VALUES, which never live in the plan.
 *
 * The plan names the secrets, because a service that refuses to boot without
 * one must be able to say so. The VALUES are a different kind of fact: they
 * are the material of the secret, and they are read from the environment of
 * the process that runs the deploy.
 *
 * The order matters and is the whole reason this module exists: a secret is
 * created, then a VERSION of it is added with the value, and only then is it
 * mounted. Mounting a secret that has no version points the service at
 * nothing, and the service fails to start with a message about a secret
 * rather than about a missing version.
 */

import type { ICommand } from './command.js';
import type { IPlan } from './plan.js';

/**
 * The environment variable that carries a secret's value.
 *
 * `nexora-internal-api-key` becomes `NEXORA_SECRET_NEXORA_INTERNAL_API_KEY`,
 * which is awkward. The prefix is stripped where it is the plan's own, so
 * the name reads `NEXORA_SECRET_INTERNAL_API_KEY`.
 */
export function secretValueEnvName(secret: string): string {
	const bare = secret.startsWith('nexora-') ? secret.slice('nexora-'.length) : secret;
	return `NEXORA_SECRET_${bare.replace(/-/g, '_').toUpperCase()}`;
}

/**
 * The command that adds a version of a secret, carrying the value on stdin.
 *
 * The value is written to the command's input rather than passed as an
 * argument, because an argument is visible in the process list and in the
 * shell history, and a secret that leaks there has leaked.
 */
export function secretValueCommand(name: string, project: string): ICommand {
	return {
		label: `put a value into ${name}`,
		args: [
			'secrets', 'versions', 'add', name,
			'--data-file', '=-',
			'--project', project,
			'--quiet',
		],
	};
}

/**
 * The secrets that have a value available, and the ones that do not.
 *
 * A missing value is not a warning: a service mounted on a secret with no
 * version will not boot, and it will not boot with a message that names the
 * secret. So this is a refusal.
 */
export function secretBlockers(
	plan: IPlan,
	values: Readonly<Record<string, string | undefined>>
): string[] {
	const blockers: string[] = [];
	for (const secret of plan.secrets) {
		const name = secretValueEnvName(secret.name);
		const value = values[name];
		if (value === undefined || value.trim().length === 0) {
			blockers.push(
				`no value for the secret ${secret.name}; set ${name} in the environment that runs the deploy`
			);
		}
	}
	return blockers;
}

/**
 * The secrets whose values are available, by secret name.
 *
 * Only the ones that are: a secret with no value is not written at all, so a
 * half-configured deploy does not overwrite a good value with an empty one.
 */
export function availableSecrets(
	plan: IPlan,
	values: Readonly<Record<string, string | undefined>>
): { readonly name: string; readonly value: string }[] {
	const available: { name: string; value: string }[] = [];
	for (const secret of plan.secrets) {
		const value = values[secretValueEnvName(secret.name)];
		if (value !== undefined && value.trim().length > 0) {
			available.push({ name: secret.name, value });
		}
	}
	return available;
}
