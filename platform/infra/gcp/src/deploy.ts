/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Apply the Google Cloud plan.
 *
 * This is the thin thing: it resolves what `plan.ts` has already checked and
 * hands it to `gcloud`. The order matters and is the reason the deploy is two
 * passes:
 *
 *   1. The services that depend on nothing are deployed first.
 *   2. Their URLs are read back from the Cloud Run API — a Cloud Run URL
 *      carries a hash that does not exist until the service does.
 *   3. The services that depend on others are deployed with those URLs filled
 *      in.
 *
 * Nothing here is destructive by default. `--apply` is required to touch a
 * project, and the plan is validated (against the source tree) before any
 * command runs, so a plan that has drifted fails before it can deploy a
 * half-right thing.
 *
 * Run:  node infra/gcp/deploy.ts --print     # show the commands, change nothing
 *       node infra/gcp/deploy.ts --apply     # apply the plan to the project
 *       node infra/gcp/deploy.ts --check     # validate the plan and exit
 */

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fillPlan, planBlockers, readPlan, PLATFORM_ROOT, type IPlan, type IPlannedService } from './plan.js';
import { imageBlockers, movingImage, resolveImage, runningImage } from './image.js';
import { iamCommands } from './iam.js';
import { availableSecrets, secretBlockers, secretValueCommand } from './secrets.js';
import { rollbackBlockers, rollbackCommands } from './rollback.js';
import type { ICommand } from './command.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** What a single gcloud invocation looks like, as data. */
export type { ICommand };

/**
 * The gcloud commands that deploy one service.
 *
 * Pure: the caller supplies the image and the plan, and gets back the list.
 * A unit test can read it without a project, a credential, or a network.
 */
export function deployCommands(
	planned: IPlannedService,
	image: string,
	region: string,
	project: string
): ICommand[] {
	const envPairs = Object.entries(planned.env).map(([k, v]) => `${k}=${v}`);
	const secretPairs = planned.secrets.map(s => `${s.env}=${s.secret}:latest`);
	const commands: ICommand[] = [
		{
			label: `deploy ${planned.name}`,
			args: [
				'run', 'deploy', planned.name,
				'--image', image,
				'--region', region,
				'--project', project,
				'--platform', 'managed',
				'--allow-unauthenticated',
				'--ingress', planned.ingress,
				// The scaling knobs. `--min-instances 0` is scale to zero: the
				// service costs nothing while idle and pays a cold start on the
				// first request. `--cpu-threshold` is when it grows, and
				// `--concurrency` is how much it takes on before it grows.
				'--min-instances', String(planned.minInstances),
				'--max-instances', String(planned.maxInstances),
				'--cpu-threshold', String(planned.cpuThreshold),
				'--concurrency', String(planned.concurrency),
				'--cpu', planned.cpu,
				'--memory', planned.memory,
				'--timeout', `${planned.timeoutSeconds}s`,
				'--port', '8080',
				'--set-env-vars', envPairs.join(','),
			],
		},
	];
	if (secretPairs.length > 0) {
		commands.push({
			label: `mount secrets for ${planned.name}`,
			args: [
				'run', 'services', 'update', planned.name,
				'--region', region,
				'--project', project,
				'--set-secrets', secretPairs.join(','),
			],
		});
	}
	return commands;
}

/** The gcloud command that turns the automated backups on. */
export function backupCommands(plan: IPlan): ICommand[] {
	const backup = plan.database.backup;
	const retention = `file-retention=${backup.fileRetentionDays},transaction-log-retention=${backup.transactionLogRetentionDays}`;
	return [
		{
			label: `turn on the automated backups for ${plan.database.instance}`,
			args: [
				'sql', 'instances', 'patch', plan.database.instance,
				'--backup-start-time', backup.startTime,
				'--retention-settings', retention,
				'--enable-point-in-time-recovery',
				'--require-ssl',
				'--project', plan.project,
			],
		},
		{
			label: `protect ${plan.database.instance} from deletion`,
			args: [
				'sql', 'instances', 'patch', plan.database.instance,
				'--deletion-protection',
				'--project', plan.project,
			],
		},
	];
}

/**
 * The gcloud command that sets the budget alert.
 *
 * The billing account is the operator's: it belongs to a billing account and
 * not to a project, so it is read from the environment and passed in here.
 * The plan says which variable carries it.
 */
export function budgetCommand(plan: IPlan, billingAccount: string): ICommand {
	const budget = plan.observability.budget;
	return {
		label: `create the budget alert ${budget.displayName}`,
		args: [
			'billing', 'budgets', 'create',
			'--billing-account', billingAccount,
			'--budget-amount', String(budget.amount),
			'--currency', budget.currency,
			'--display-name', budget.displayName,
			'--threshold-rules', budget.thresholds.map((t) => `${Math.round(t * 100)}%`).join(','),
			'--project', plan.project,
		],
	};
}

/**
 * The load balancer in front of the gateway.
 *
 * A Serverless NEG points at the Cloud Run service, an external HTTPS load
 * balancer terminates TLS for the domain and routes to it, and a
 * Google-managed certificate is the certificate. Nothing else is published:
 * the four internal services have `internal` ingress, so they are reachable
 * only by other Cloud Run services and by this balancer.
 */
export function loadBalancerCommands(plan: IPlan): ICommand[] {
	const lb = plan.loadBalancer;
	return [
		{
			label: `create the serverless NEG for ${lb.service}`,
			args: [
				'compute', 'network-endpoint-groups', 'create', `${lb.name}-neg`,
				'--network-endpoint-type', 'serverless',
				'--cloud-run-service', lb.service,
				'--region', plan.region,
				'--project', plan.project,
			],
			exists: [
				'compute', 'network-endpoint-groups', 'describe', `${lb.name}-neg`,
				'--region', plan.region,
				'--project', plan.project,
			],
		},
		{
			label: `create the backend service for ${lb.name}`,
			args: [
				'compute', 'backend-services', 'create', `${lb.name}-backend`,
				'--global',
				'--load-balancing-scheme', 'EXTERNAL_MANAGED',
				'--protocol', 'HTTPS',
				'--backend-config', `id=${lb.name}-neg`,
				'--project', plan.project,
			],
			exists: [
				'compute', 'backend-services', 'describe', `${lb.name}-backend`,
				'--global',
				'--project', plan.project,
			],
		},
		{
			label: `create the certificate for ${lb.domain}`,
			args: [
				'compute', 'ssl-certificates', 'create', lb.certificate,
				'--domains', lb.domain,
				'--global',
				'--project', plan.project,
			],
			exists: [
				'compute', 'ssl-certificates', 'describe', lb.certificate,
				'--global',
				'--project', plan.project,
			],
		},
		{
			label: `create the URL map for ${lb.domain}`,
			args: [
				'compute', 'url-maps', 'create', `${lb.name}-map`,
				'--default-service', `${lb.name}-backend`,
				'--global',
				'--project', plan.project,
			],
			exists: [
				'compute', 'url-maps', 'describe', `${lb.name}-map`,
				'--global',
				'--project', plan.project,
			],
		},
		{
			label: `create the target proxy for ${lb.domain}`,
			args: [
				'compute', 'target-https-proxies', 'create', `${lb.name}-proxy`,
				'--url-map', `${lb.name}-map`,
				'--ssl-certificates', lb.certificate,
				'--global',
				'--project', plan.project,
			],
			exists: [
				'compute', 'target-https-proxies', 'describe', `${lb.name}-proxy`,
				'--global',
				'--project', plan.project,
			],
		},
		{
			label: `create the forwarding rule for ${lb.domain}`,
			args: [
				'compute', 'forwarding-rules', 'create', `${lb.name}-rule`,
				'--global',
				'--target-https-proxy', `${lb.name}-proxy`,
				'--ports', '443',
				'--address', `${lb.name}-address`,
				'--project', plan.project,
			],
			exists: [
				'compute', 'forwarding-rules', 'describe', `${lb.name}-rule`,
				'--global',
				'--project', plan.project,
			],
		},
		{
			label: `reserve the address for ${lb.domain}`,
			args: [
				'compute', 'addresses', 'create', `${lb.name}-address`,
				'--global',
				'--ip-version', 'IPV4',
				'--network-tier', 'PREMIUM',
				'--project', plan.project,
			],
			exists: [
				'compute', 'addresses', 'describe', `${lb.name}-address`,
				'--global',
				'--project', plan.project,
			],
		},
	];
}

/** The gcloud command that creates the Cloud SQL instance and its databases. */
export function databaseCommands(plan: IPlan): ICommand[] {
	const commands: ICommand[] = [
		{
			label: `create the instance ${plan.database.instance}`,
			args: [
				'sql', 'instances', 'create', plan.database.instance,
				'--database-version', plan.database.engineVersion,
				'--tier', plan.database.tier,
				'--availability-type', plan.database.availability,
				'--region', plan.region,
				'--project', plan.project,
				'--no-assign-ip',
			],
			exists: ['sql', 'instances', 'describe', plan.database.instance, '--project', plan.project],
		},
	];
	for (const database of plan.database.databases) {
		commands.push({
			label: `create the database ${database}`,
			args: [
				'sql', 'databases', 'create', database,
				'--instance', plan.database.instance,
				'--project', plan.project,
			],
			exists: [
				'sql', 'databases', 'describe', database,
				'--instance', plan.database.instance,
				'--project', plan.project,
			],
		});
	}
	return commands;
}

/** The gcloud command that creates a Secret Manager entry. */
export function secretCommand(name: string, project: string): ICommand {
	return {
		label: `create the secret ${name}`,
		args: ['secrets', 'create', name, '--replication-policy', 'automatic', '--project', project],
		exists: ['secrets', 'describe', name, '--project', project],
	};
}

/** The gcloud command that creates the Artifact Registry repository. */
export function registryCommand(plan: IPlan): ICommand {
	return {
		label: `create the repository ${plan.artifactRegistry}`,
		args: [
			'artifacts', 'repositories', 'create', plan.artifactRegistry,
			'--repository-format', 'docker',
			'--location', plan.region,
			'--project', plan.project,
		],
		exists: [
			'artifacts', 'repositories', 'describe', plan.artifactRegistry,
			'--project', plan.project,
		],
	};
}

/** The URL a deployed service answers on, read back from the API. */
export function serviceUrl(name: string, region: string, project: string): string {
	const out = execFileSync(
		'gcloud',
		['run', 'services', 'describe', name, '--region', region, '--project', project, '--format', 'value(status.url)'],
		{ encoding: 'utf8' }
	);
	return out.trim();
}

/** The Cloud SQL instance's public or proxy address, as the connection string wants it. */
export function databaseHost(instance: string, project: string): string {
	const out = execFileSync(
		'gcloud',
		['sql', 'instances', 'describe', instance, '--project', project, '--format', 'value(ipAddresses[0].ipAddress)'],
		{ encoding: 'utf8' }
	);
	return out.trim();
}

/** The Cloud SQL connection name, which the services connect through. */
export function databaseConnectionName(instance: string, region: string, project: string): string {
	return `${project}:${region}:${instance}`;
}

/**
 * Run a command that CREATES something, skipping it when it is already there.
 *
 * A create that is not checked is a deploy that only works once, and the
 * second run fails on the first resource that already exists — which reads
 * as a broken deploy rather than as a repeat of a good one.
 */
function applyCreate(command: ICommand): void {
	if (command.exists) {
		try {
			execFileSync('gcloud', [...command.exists, '--format', 'value(name)'], {
				stdio: ['ignore', 'pipe', 'ignore'],
			});
			console.log(`  (already there: ${command.label})`);
			return;
		} catch {
			/* it is not there, so make it */
		}
	}
	console.log(`gcloud ${command.args.join(' ')}`);
	execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
}

/**
 * Put a value into a Secret Manager entry.
 *
 * The value goes in on stdin. An argument would be visible in the process
 * list and in the shell history, and a secret that leaks there has leaked.
 */
function applySecretValue(name: string, project: string, value: string): void {
	const command = secretValueCommand(name, project);
	console.log(`gcloud ${command.args.join(' ')}`);
	execFileSync('gcloud', [...command.args], {
		stdio: ['pipe', 'inherit', 'inherit'],
		input: value,
	});
}

function main(): void {
	const args = process.argv.slice(2);
	const plan = readPlan();

	const blockers = planBlockers(plan);
	if (blockers.length > 0) {
		console.error('REFUSING TO DEPLOY: the plan does not match the code it claims to deploy.');
		for (const reason of blockers) {
			console.error(`  - ${reason}`);
		}
		process.exit(1);
	}
	console.log(`plan ok: ${plan.services.length} services, ${plan.secrets.length} secrets, ${plan.database.databases.length} databases.`);

	if (args.includes('--check')) {
		return;
	}

	const project = plan.project;
	const region = plan.region;

	// The billing account is the operator's, and it is optional in the sense
	// that the platform can run without a budget — but not optional in the
	// sense that its absence goes unmentioned. A deploy that could not create
	// the budget says so, loudly, because a budget that alerts nobody is the
	// same as no budget.
	const billingAccount = (process.env[plan.observability.budget.billingAccountEnv] ?? '').trim();

	// The image, and the problems with it. The problems are computed before
	// anything is created, so a wrong image costs nothing — but printing the
	// commands is harmless, and the printed plan is how a person reads what a
	// deploy WOULD do. So the refusal happens after the print, and the print
	// says what would stop it.
	const image = resolveImage(plan);
	const imageProblems = imageBlockers(plan, image);
	console.log(`image: ${image}`);

	if (args.includes('--print')) {
		if (imageProblems.length > 0) {
			console.log('\nTHESE WOULD STOP THE DEPLOY:');
			for (const reason of imageProblems) {
				console.log(`  - ${reason}`);
			}
		}
		for (const command of [
			registryCommand(plan),
			...iamCommands(plan),
			...databaseCommands(plan),
			...backupCommands(plan),
			budgetCommand(plan, billingAccount || 'NO_BILLING_ACCOUNT'),
			...loadBalancerCommands(plan),
			...plan.secrets.map(s => secretCommand(s.name, project)),
		]) {
			console.log(`gcloud ${command.args.join(' ')}`);
		}
		/* The services, in the same two passes the apply path uses. Without
		 * them the printed plan showed the scaffolding and not the platform:
		 * a database, a load balancer, a certificate, and no service to serve
		 * anything. The URLs of the services that depend on others are
		 * placeholders here, because a Cloud Run URL does not exist until the
		 * service does; the apply path reads them back and fills them in. */
		const independents = plan.services.filter(s => s.dependsOn.length === 0).sort((a, b) => a.order - b.order);
		for (const planned of independents) {
			console.log(`\\n— ${planned.name}`);
			for (const command of deployCommands(planned, image, region, project)) {
				console.log(`  gcloud ${command.args.join(' ')}`);
			}
		}
		const dependents = plan.services.filter(s => s.dependsOn.length > 0).sort((a, b) => a.order - b.order);
		for (const planned of dependents) {
			console.log(`\\n— ${planned.name}`);
			for (const command of deployCommands(planned, image, region, project)) {
				console.log(`  gcloud ${command.args.join(' ')}`);
			}
		}
		return;
	}

	// The rollback, before anything is changed. The address of the image that
	// is running right now is read from the API, because a remembered image
	// is a guess and a rollback made from a guess is a second outage.
	if (args.includes('--rollback')) {
		const wanted = args.find(a => a.startsWith('--image='))?.slice('--image='.length);
		const previous = wanted ?? runningImage(plan);
		const rollbackProblems = rollbackBlockers(plan, previous);
		if (rollbackProblems.length > 0) {
			console.error('REFUSING TO ROLL BACK: there is nothing to roll back to.');
			for (const reason of rollbackProblems) {
				console.error(`  - ${reason}`);
			}
			process.exit(1);
		}
		console.log(`rolling every service back to ${previous}`);
		for (const command of rollbackCommands(plan, previous)) {
			console.log(`gcloud ${command.args.join(' ')}`);
			execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
		}
		console.log('\\nrolled back.');
		return;
	}

	if (!args.includes('--apply')) {
		console.log('Nothing to do: pass --print to see the commands, --check to only validate, --apply to deploy, --rollback to put the platform back on the previous image.');
		return;
	}

	// The refusal, now that printing is done with.
	if (imageProblems.length > 0) {
		console.error('REFUSING TO DEPLOY: the image cannot be deployed.');
		for (const reason of imageProblems) {
			console.error(`  - ${reason}`);
		}
		process.exit(1);
	}

	// The registry first: the image has to be pullable before anything that
	// runs it is created.
	applyCreate(registryCommand(plan));

	// The accounts, before the services: a service deployed with an account
	// that does not exist yet comes up with no identity at all.
	for (const command of iamCommands(plan)) {
		if (command.exists) {
			applyCreate(command);
		} else {
			console.log(`gcloud ${command.args.join(' ')}`);
			execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
		}
	}

	// The database first, with its backups on: a service that boots against a
	// database that is not there yet fails to start, and a database with no
	// backups is the whole of the product's evidence on one disk.
	for (const command of [...databaseCommands(plan), ...backupCommands(plan)]) {
		if (command.exists) {
			applyCreate(command);
		} else {
			console.log(`gcloud ${command.args.join(' ')}`);
			execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
		}
	}

	// The secrets, and then their values. A secret is created, then a VERSION
	// is added, and only then can a service mount it: mounting a secret with
	// no version points the service at nothing, and it fails to start with a
	// message about the secret rather than about the missing version.
	const values = availableSecrets(plan, process.env as Record<string, string | undefined>);
	const missing = secretBlockers(plan, process.env as Record<string, string | undefined>);
	if (missing.length > 0) {
		console.error('REFUSING TO DEPLOY: a secret has no value.');
		for (const reason of missing) {
			console.error(`  - ${reason}`);
		}
		process.exit(1);
	}
	for (const secret of plan.secrets) {
		applyCreate(secretCommand(secret.name, project));
	}
	for (const secret of values) {
		applySecretValue(secret.name, project, secret.value);
	}

	// Pass one: the services that depend on nobody. They are the ones whose
	// URLs the others need, so they have to exist before anything can point at
	// them.
	const independents = plan.services.filter(s => s.dependsOn.length === 0).sort((a, b) => a.order - b.order);
	for (const planned of independents) {
		console.log(`— ${planned.name}`);
		for (const command of deployCommands(planned, image, region, project)) {
			console.log(`  gcloud ${command.args.join(' ')}`);
			execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
		}
	}

	// Read the URLs back. A Cloud Run URL carries a hash that is not knowable
	// before the service exists, so this is the only way to learn it.
	const peerUrls: Record<string, string> = {};
	for (const planned of independents) {
		peerUrls[planned.service] = serviceUrl(planned.name, region, project);
		console.log(`  ${planned.service} → ${peerUrls[planned.service]}`);
	}

	// Pass two: everything else, with the URLs it calls filled in.
	const dependents = plan.services.filter(s => s.dependsOn.length > 0).sort((a, b) => a.order - b.order);
	for (const planned of dependents) {
		const known = Object.fromEntries(
			Object.entries(peerUrls).filter(([, url]) => !url.includes('{{'))
		);
		const filled = fillPlan(plan, known, { host: '{{db_host}}', password: '{{db_password}}' });
		const target = filled.services.find(s => s.name === planned.name)!;
		console.log(`— ${planned.name}`);
		for (const command of deployCommands(target, image, region, project)) {
			console.log(`  gcloud ${command.args.join(' ')}`);
			execFileSync('gcloud', [...command.args], { stdio: 'inherit' });
		}
		peerUrls[planned.service] = serviceUrl(planned.name, region, project);
	}

	// The load balancer comes last: the services have to exist before the NEG
	// can point at one of them, and the certificate has to exist before the
	// proxy that uses it.
	for (const command of loadBalancerCommands(plan)) {
		applyCreate(command);
	}

	// The bill is watched. It is the last thing, because it needs a billing
	// account and the account is not something a project can create for
	// itself. If the account is not in the environment the budget is NOT
	// created, and the run says so in terms nobody can miss.
	if (billingAccount) {
		applyCreate(budgetCommand(plan, billingAccount));
	} else {
		console.log(
			`\nTHE BUDGET WAS NOT CREATED: ${plan.observability.budget.billingAccountEnv} is not set.\n` +
				`The platform is up, but nothing alerts before the money is spent.\n`
		);
	}

	console.log(`\\ndeployed. the public surface is https://${plan.loadBalancer.domain}\\n`);
}

/**
 * Whether this file is the command being run, rather than a module something
 * else imported.
 *
 * The comparison is against this file's OWN path, exactly. A name-based test
 * ("does it end with deploy.ts") is true of the SOURCE and false of the
 * BUILT file, and the built file is the one the pipeline runs — so the
 * command would quietly do nothing.
 */
const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isTheCommand) {
	main();
}
