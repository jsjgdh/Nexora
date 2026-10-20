/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The accounts, and what they are allowed to do.
 *
 * A deploy needs an account that can create the platform, and the platform
 * needs an account that can do the platform's work and nothing else. Those
 * are two different permissions, and a deployment that gives the running
 * services the deploying account's permissions has made every service that
 * can be talked to into an account that can create services.
 *
 * The roles live in the plan, so they are data that can be read and reviewed
 * rather than code that has to be read to be trusted. Each one carries the
 * reason it is there, because a role without a reason is a role nobody
 * removes.
 */

import type { ICommand } from './command.js';
import type { IPlan } from './plan.js';

/** The address of a service account in a project. */
export function serviceAccountAddress(name: string, project: string): string {
	return `${name}@${project}.iam.gserviceaccount.com`;
}

/** The command that creates a service account, if it does not exist. */
export function serviceAccountCommand(name: string, project: string): ICommand {
	return {
		label: `create the service account ${name}`,
		args: [
			'iam', 'service-accounts', 'create', name,
			'--display-name', `NEXORA ${name}`,
			'--project', project,
			'--quiet',
		],
		exists: [
			'iam', 'service-accounts', 'describe',
			serviceAccountAddress(name, project),
			'--project', project,
		],
	};
}

/**
 * The command that grants a role.
 *
 * `add-iam-policy-binding` is used rather than `set-iam-policy-binding`, and
 * the difference matters: `set` REPLACES the whole policy, so a role that
 * was granted by hand and is not in the plan would be silently removed. `add`
 * grants one role and leaves the rest.
 */
export function roleBindingCommand(
	member: string,
	role: string,
	project: string
): ICommand {
	return {
		label: `grant ${role} to ${member}`,
		args: [
			'projects', 'add-iam-policy-binding', project,
			'--member', `serviceAccount:${member}`,
			'--role', role,
			'--quiet',
		],
	};
}

/**
 * Every binding the deploy makes, in the order it makes them.
 *
 * The order is not important to Google, but it is important to a person
 * reading a log: the accounts come first, because a binding to an account
 * that does not exist is a binding that grants nothing.
 */
export function iamCommands(plan: IPlan): ICommand[] {
	const commands: ICommand[] = [];
	const deploy = serviceAccountAddress(plan.iam.deployAccount, plan.project);
	const runtime = serviceAccountAddress(plan.runtimeServiceAccount, plan.project);

	commands.push(serviceAccountCommand(plan.iam.deployAccount, plan.project));
	commands.push(serviceAccountCommand(plan.runtimeServiceAccount, plan.project));

	for (const binding of plan.iam.deployRoles) {
		commands.push(roleBindingCommand(deploy, binding.role, plan.project));
	}
	for (const binding of plan.iam.runtimeRoles) {
		commands.push(roleBindingCommand(runtime, binding.role, plan.project));
	}
	return commands;
}

/**
 * Why the accounts as planned cannot work, in words.
 *
 * Empty means they can. The one that matters most is the runtime account
 * being given the deploying account's permissions, because that is the shape
 * of a compromise that nobody notices until it is used.
 */
export function iamBlockers(plan: IPlan): string[] {
	const blockers: string[] = [];
	const deploy = serviceAccountAddress(plan.iam.deployAccount, plan.project);
	const runtime = serviceAccountAddress(plan.runtimeServiceAccount, plan.project);

	if (plan.iam.deployAccount === plan.runtimeServiceAccount) {
		blockers.push(
			'the deploying account and the running account are the same account, so every service would be able to deploy'
		);
	}
	if (plan.iam.runtimeRoles.some(b => b.role === 'roles/owner')) {
		blockers.push('the running account is granted roles/owner');
	}
	if (plan.iam.runtimeRoles.some(b => b.role === 'roles/run.admin')) {
		blockers.push('the running account is granted roles/run.admin, so a compromised service could replace another one');
	}
	if (plan.iam.deployRoles.length === 0) {
		blockers.push('the deploying account has no roles, so the deploy cannot create anything');
	}
	if (plan.iam.runtimeRoles.length === 0) {
		blockers.push('the running account has no roles, so the services cannot read their own secrets');
	}
	for (const binding of [...plan.iam.deployRoles, ...plan.iam.runtimeRoles]) {
		if (!binding.why || binding.why.trim().length < 20) {
			blockers.push(`the role ${binding.role} does not say why it is granted`);
		}
	}
	// The two accounts must be able to do the two things the plan needs, or
	// the deploy fails at the first call with a permission error that reads
	// like a cloud problem and is not one.
	const deployRoles = new Set(plan.iam.deployRoles.map(b => b.role));
	for (const required of ['roles/run.admin', 'roles/sqladmin', 'roles/secretmanager.admin']) {
		if (!deployRoles.has(required)) {
			blockers.push(`the deploying account is not granted ${required}, so the deploy cannot finish`);
		}
	}
	const runtimeRoles = new Set(plan.iam.runtimeRoles.map(b => b.role));
	for (const required of ['roles/secretmanager.secretAccessor', 'roles/cloudsql.client']) {
		if (!runtimeRoles.has(required)) {
			blockers.push(`the running account is not granted ${required}, so the services cannot start`);
		}
	}
	void deploy;
	void runtime;
	return blockers;
}
