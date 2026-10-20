/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Google Cloud deployment plan, and the checks that keep it honest.
 *
 * WHY A PLAN AND CHECKS, RATHER THAN A SCRIPT
 *
 * A shell script that calls `gcloud` can only be verified by running it, against a
 * real project, with real credentials, on a real day. The things that actually
 * break a deployment are not the gcloud invocations — those are copy-paste — they
 * are the facts the script assumes about the code: that a service it deploys
 * exists, that the peer URL it writes points at the service that serves that
 * path, that the secret a service refuses to boot without is mapped, that the
 * `PORT` it sets is the one the service reads.
 *
 * Those are checkable here, against the source tree, with no cloud account at
 * all. So the plan is DATA, this file checks it against the code, and
 * `deploy.ts` is the thin thing that applies it.
 *
 * Every check below reports its own reason, in the fork's verify convention: a
 * mutant trips the check that must fire, not a collateral one that hides
 * whether the gate works.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { iamBlockers } from './iam.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLATFORM_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * The plan file, found next to the package rather than next to the module.
 *
 * `plan.json` is data, not a module, so `tsc` does not copy it into `dist/`.
 * It lives one level above both `src/` and `dist/`, so one path finds it from
 * either — which is what lets the same code read the plan when it is run from
 * source and when it is run as the built package the platform ships.
 */
export const PLAN_PATH = path.resolve(HERE, '..', 'plan.json');

/** One service as the plan describes it. */
export interface IPlannedService {
	readonly name: string;
	readonly service: string;
	readonly ingress: string;
	readonly public: boolean;
	readonly order: number;
	readonly minInstances: number;
	readonly maxInstances: number;
	readonly cpuThreshold: number;
	readonly concurrency: number;
	readonly scaleToZero: boolean;
	readonly why: string;
	readonly cpu: string;
	readonly memory: string;
	readonly timeoutSeconds: number;
	readonly dependsOn: readonly string[];
	readonly env: Readonly<Record<string, string>>;
	readonly secrets: readonly { readonly env: string; readonly secret: string }[];
	/**
	 * Variables the service's source reads and the plan deliberately does not
	 * set, each with the reason it is safe to leave unset.
	 *
	 * A variable that is read and not supplied falls back to a default the
	 * operator did not choose. Sometimes that default is exactly right — a
	 * flag that only matters on a tier this deployment does not use — and then
	 * the plan has to say so out loud, because the next person to add a
	 * service should not have to re-derive it from the source.
	 */
	readonly optionalEnv?: Readonly<Record<string, string>>;
}

/** The whole plan, as read from `plan.json`. */
export interface IPlan {
	readonly project: string;
	readonly region: string;
	readonly artifactRegistry: string;
	/**
	 * The account the services run as.
	 *
	 * It is not the account that deploys them. A service that can deploy is a
	 * service that can replace another service, and the only thing standing
	 * between a request and the whole platform is the boundary between these
	 * two names.
	 */
	readonly runtimeServiceAccount: string;
	/**
	 * Where the image lives and what its tag has to be.
	 *
	 * `requireImmutableTag` is here as data because it is a decision, and a
	 * decision that is written in a file is one that can be argued about in a
	 * review. A plan that permitted a moving tag would be a plan that cannot
	 * be rolled back, and the checker refuses one.
	 */
	readonly image: {
		readonly repository: string;
		readonly movingTag: string;
		readonly requireImmutableTag: boolean;
	};
	/**
	 * The accounts, and what each may do.
	 *
	 * Every role carries the reason it is there. A role without a reason is a
	 * role nobody ever removes.
	 */
	readonly iam: {
		readonly deployAccount: string;
		readonly deployRoles: readonly { readonly role: string; readonly why: string }[];
		readonly runtimeRoles: readonly { readonly role: string; readonly why: string }[];
	};
	readonly database: {
		readonly instance: string;
		readonly engineVersion: string;
		readonly tier: string;
		readonly availability: string;
		readonly databases: readonly string[];
		readonly backup: {
			readonly enabled: boolean;
			readonly startTime: string;
			readonly fileRetentionDays: number;
			readonly transactionLogRetentionDays: number;
			readonly pointInTimeRecovery: boolean;
			readonly binaryLogsEnabled: boolean;
		};
		readonly deletionProtection: boolean;
		readonly user: string;
	};
	readonly observability: {
		readonly logRetentionDays: number;
		readonly budget: {
			readonly displayName: string;
			/**
			 * The environment variable that carries the billing account.
			 *
			 * A budget belongs to a BILLING ACCOUNT, not to a project, and the
			 * account is an account fact rather than a code fact: it is the
			 * operator's, and it is named here so that nobody can forget that
			 * the deploy needs one. The account identifier is not a credential,
			 * but it is also not something this repository should decide.
			 */
			readonly billingAccountEnv: string;
			readonly amount: number;
			readonly currency: string;
			readonly thresholds: readonly number[];
		};
		readonly uptimeCheck: {
			readonly path: string;
			readonly periodSeconds: number;
			readonly timeoutSeconds: number;
		};
	};
	readonly services: readonly IPlannedService[];
	readonly loadBalancer: {
		readonly name: string;
		readonly domain: string;
		readonly certificate: string;
		readonly service: string;
	};
	readonly secrets: readonly {
		readonly name: string;
		readonly purpose: string;
		readonly generate: string;
		/** The placeholder this secret's value is substituted into, when it is a value inside another variable rather than an environment variable of its own. */
		readonly placeholder?: string;
	}[];
}

/** The plan, read from disk. */
export function readPlan(planPath = PLAN_PATH): IPlan {
	return JSON.parse(fs.readFileSync(planPath, 'utf8')) as IPlan;
}

/**
 * The environment variables a service's own source reads.
 *
 * Read from the code rather than from a hand-written list, so a service that
 * starts reading a new variable is caught here rather than by a service that
 * boots with a default it should not have had.
 *
 * The `data/` directory is skipped on purpose. It holds COURSE CONTENT — the
 * lesson bodies, and the synced fixture suites the platform judges learners
 * with — and course content mentions `process.env.DATABASE_URL` because the
 * course teaches about it. That is a sentence in a lesson, not a requirement
 * of the service, and reading it as one would put a database in front of a
 * service that owns no data.
 */
export function serviceEnvVars(service: string): Set<string> {
	const root = path.join(PLATFORM_ROOT, 'services', service, 'src');
	const found = new Set<string>();
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'data') {
					walk(full);
				}
				continue;
			}
			if (!entry.name.endsWith('.ts')) {
				continue;
			}
			const source = fs.readFileSync(full, 'utf8');
			for (const match of source.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
				found.add(match[1]);
			}
			// The gateway reads its configuration through helpers that take the env
			// bag as an argument — `str(env, "AUTH_JWT_SECRET")`,
			// `url(env, "CURRICULUM_URL", …)` — so the variable name is not
			// always right after an `env(`. Both spellings are collected.
			for (const match of source.matchAll(/\benv\(\s*"([A-Z_][A-Z0-9_]*)"/g)) {
				found.add(match[1]);
			}
			for (const match of source.matchAll(/\benv\s*,\s*"([A-Z_][A-Z0-9_]*)"/g)) {
				found.add(match[1]);
			}
		}
	};
	if (fs.existsSync(root)) {
		walk(root);
	}
	return found;
}

/** The placeholders the deploy fills in, in the form they appear in the plan. */
export const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

/**
 * Every reason the plan does not match the code it claims to deploy.
 *
 * An empty array means the plan and the source tree agree.
 */
export function planBlockers(plan: IPlan): string[] {
	const blockers: string[] = [];
	const byService = new Map(plan.services.map(s => [s.service, s]));
	const byName = new Map(plan.services.map(s => [s.name, s]));

	// (1) Every service in the plan is a service that exists.
	for (const planned of plan.services) {
		if (!fs.existsSync(path.join(PLATFORM_ROOT, 'services', planned.service))) {
			blockers.push(`the plan deploys "${planned.service}", which is not a service in this repository`);
		}
	}

	// (2) Every service that EXISTS is in the plan. A service that is not
	// deployed is a service that answers 503 for the gateway, and the gateway
	// is the only public surface, so the whole product is down behind it.
	const onDisk = fs
		.readdirSync(path.join(PLATFORM_ROOT, 'services'), { withFileTypes: true })
		.filter(e => e.isDirectory())
		.map(e => e.name)
		.sort();
	for (const service of onDisk) {
		if (!byService.has(service)) {
			blockers.push(`the repository has a service "${service}" that the plan does not deploy`);
		}
	}

	// (3) Exactly one public service, and it is the gateway. A second public
	// service is a second public surface, which is the thing the gateway
	// exists to prevent.
	const publicServices = plan.services.filter(s => s.public);
	if (publicServices.length !== 1 || publicServices[0]?.service !== 'gateway') {
		blockers.push('exactly one service is public and it is the gateway; the plan says otherwise');
	}

	// (4) PORT is 8080 for every service. Cloud Run hands a container one port
	// and the container must bind it; a service that defaults to 8101 and is
	// told PORT=8080 binds it, and a service told anything else never answers.
	for (const planned of plan.services) {
		if (planned.env.PORT !== '8080') {
			blockers.push(`${planned.name} sets PORT=${planned.env.PORT ?? '(unset)'}; Cloud Run serves one port and it is 8080`);
		}
	}

	// (5) Every environment variable the service's code reads is either in the
	// plan's env, in the plan's secrets, or listed with a reason as
	// deliberately unset. A variable that is read and not supplied falls back
	// to a default the operator did not choose — which is exactly how a
	// deployment ends up quietly different from the one that was tested.
	for (const planned of plan.services) {
		const supplied = new Set([
			...Object.keys(planned.env),
			...planned.secrets.map(s => s.env),
		]);
		for (const variable of serviceEnvVars(planned.service)) {
			if (supplied.has(variable)) {
				continue;
			}
			const reason = planned.optionalEnv?.[variable];
			if (!reason) {
				blockers.push(`${planned.name} does not supply ${variable}, which its own source reads`);
			} else if (reason.trim().length < 20) {
				blockers.push(`${planned.name} leaves ${variable} unset without saying why`);
			}
		}
	}

	// (6) Every secret the plan maps exists in the plan's secret list, and
	// every secret in that list is mapped by at least one service. A secret
	// nobody mounts is a secret the operator created for nothing; a secret
	// mounted that does not exist is a service that boots with an empty value.
	const declared = new Set(plan.secrets.map(s => s.name));
	for (const planned of plan.services) {
		for (const mapping of planned.secrets) {
			if (!declared.has(mapping.secret)) {
				blockers.push(`${planned.name} maps ${mapping.env} from "${mapping.secret}", which the plan does not declare`);
			}
		}
	}
	const mapped = new Set(plan.services.flatMap(s => s.secrets.map(m => m.secret)));
	// A secret can also be used as a VALUE inside another variable — the
	// database password lives in the DATABASE_URL, not in an environment
	// variable of its own — so a declared secret counts as used when the plan
	// substitutes it into a value as well as when a service mounts it.
	const substituted = new Set(plan.services.flatMap(s => Object.values(s.env)).flatMap(v => [...v.matchAll(PLACEHOLDER)].map(m => m[1])));
	for (const secret of plan.secrets) {
		if (!mapped.has(secret.name) && !(secret.placeholder && substituted.has(secret.placeholder))) {
			blockers.push(`the plan declares the secret "${secret.name}" but nothing uses it`);
		}
	}

	// (7) No secret VALUE is written in the plan. The plan names where a value
	// comes from; the value itself belongs in Secret Manager and nowhere else.
	// The names below are the ones whose VALUE is sensitive — a password, a
	// signing secret, a private key, an API key. A TTL or a limit is a number
	// the operator chose, and calling it a secret would only make the check
	// noisy enough to be ignored.
	const secretish = /PASSWORD|SECRET|PRIVATE_KEY|API_KEY/;
	for (const planned of plan.services) {
		for (const [key, value] of Object.entries(planned.env)) {
			if (secretish.test(key) && value.length > 0 && !value.includes('{{')) {
				blockers.push(`${planned.name} writes a value for ${key}; a secret belongs in Secret Manager, not in the plan`);
			}
		}
	}

	// (8) Every placeholder names a service in the plan, or a database fact the
	// plan declares. A placeholder the deploy cannot fill is a URL that is
	// literally the string "{{auth}}" — which fails at runtime, in production,
	// as a DNS error nobody can read.
	const servicePlaceholders = new Set(plan.services.map(s => s.service));
	for (const planned of plan.services) {
		for (const value of Object.values(planned.env)) {
			for (const match of value.matchAll(PLACEHOLDER)) {
				const name = match[1];
				if (name === 'db_password' || name === 'db_host') {
					continue;
				}
				if (!servicePlaceholders.has(name)) {
					blockers.push(`${planned.name} has a placeholder {{${name}}}, which is not a service in the plan`);
				}
			}
		}
	}

	// (9) The peer URLs the gateway holds point at services that exist, and the
	// services that hold peer URLs depend on them. A gateway that calls a
	// service which was never deployed answers 502 for every request it
	// forwards.
	const gateway = byService.get('gateway');
	if (gateway) {
		const peerEnv = ['AUTH_URL', 'CURRICULUM_URL', 'EXECUTION_URL', 'BILLING_URL'];
		for (const variable of peerEnv) {
			const value = gateway.env[variable];
			if (!value) {
				blockers.push(`the gateway does not set ${variable}`);
				continue;
			}
			const match = new RegExp(`\\{\\{([a-z_]+)\\}\\}`).exec(value);
			const target = match?.[1];
			if (!target) {
				blockers.push(`the gateway's ${variable} is not a peer placeholder (${value})`);
				continue;
			}
			if (!byService.has(target)) {
				blockers.push(`the gateway's ${variable} points at "${target}", which the plan does not deploy`);
				continue;
			}
			if (!gateway.dependsOn.includes(byService.get(target)!.name)) {
				blockers.push(`the gateway calls ${target} but does not depend on it, so the deploy order can be wrong`);
			}
		}
	}

	// (10) Every dependency names a service that is in the plan, and no service
	// depends on itself.
	for (const planned of plan.services) {
		for (const dependency of planned.dependsOn) {
			if (!byName.has(dependency)) {
				blockers.push(`${planned.name} depends on "${dependency}", which the plan does not deploy`);
			}
			if (dependency === planned.name) {
				blockers.push(`${planned.name} depends on itself`);
			}
		}
	}

	// (11) The dependency order is acyclic. A cycle would make the deploy
	// order impossible to satisfy, and it would only show up as a deploy that
	// hangs.
	const order = new Map(plan.services.map(s => [s.name, s.order]));
	const seen = new Set<string>();
	const visiting = new Set<string>();
	const walk = (name: string): boolean => {
		if (seen.has(name)) {
			return true;
		}
		if (visiting.has(name)) {
			blockers.push(`the deployment order has a cycle through "${name}"`);
			return false;
		}
		visiting.add(name);
		for (const dependency of byName.get(name)?.dependsOn ?? []) {
			if (byName.has(dependency)) {
				walk(dependency);
			}
		}
		visiting.delete(name);
		seen.add(name);
		return true;
	};
	for (const planned of plan.services) {
		walk(planned.name);
	}
	// And the declared order agrees with the dependencies: a service's order
	// number must be greater than every service it depends on.
	for (const planned of plan.services) {
		for (const dependency of planned.dependsOn) {
			const other = byName.get(dependency);
			if (other && order.get(dependency)! >= planned.order) {
				blockers.push(`${planned.name} (order ${planned.order}) depends on ${dependency} (order ${other.order}); the dependency must come first`);
			}
		}
	}

	// (12) The databases named in the DATABASE_URLs are the ones the instance
	// creates, and each service that owns data owns exactly one.
	const databases = new Set(plan.database.databases);
	for (const planned of plan.services) {
		const url = planned.env.DATABASE_URL;
		if (!url) {
			continue;
		}
		const name = /\/([a-z]+)$/.exec(url)?.[1];
		if (!name || !databases.has(name)) {
			blockers.push(`${planned.name} points at the database "${name ?? '(none)'}", which the instance does not create`);
		}
	}
	const ownerOf = new Map<string, string>();
	for (const planned of plan.services) {
		const url = planned.env.DATABASE_URL;
		if (!url) {
			continue;
		}
		const name = /\/([a-z]+)$/.exec(url)?.[1] ?? '';
		const owner = ownerOf.get(name);
		if (owner) {
			blockers.push(`${planned.name} and ${owner} share the database "${name}"; each service that owns data owns exactly one`);
		}
		ownerOf.set(name, planned.name);
	}

	// (13) The load balancer points at the public service.
	if (plan.loadBalancer.service !== publicServices[0]?.name) {
		blockers.push(`the load balancer points at "${plan.loadBalancer.service}", which is not the public service`);
	}

	// (14) The receipt key is split, and each half is held by exactly the
	// service that needs it. The PRIVATE half mints receipts, so it belongs to
	// the service that runs the code and signs what it saw — and to nothing
	// else. The PUBLIC half verifies them, so it belongs to the service that
	// stores them. A service that holds the private key and does not mint is a
	// key one more service can leak from; a service that mints and stores is a
	// service that can write itself evidence.
	const minters = plan.services
		.filter(s => s.secrets.some(m => m.env === "RECEIPT_ED25519_KEY"))
		.map(s => s.service)
		.sort();
	for (const holder of minters) {
		if (holder !== "execution") {
			blockers.push(`${holder} holds the receipt PRIVATE key, but only the execution service runs code and signs what it observed`);
		}
	}
	if (!minters.includes("execution")) {
		blockers.push("the execution service holds no receipt private key, so nothing can mint a receipt");
	}
	const verifiers = plan.services
		.filter(s => s.secrets.some(m => m.env === "RECEIPT_ED25519_PUBLIC_KEY"))
		.map(s => s.service)
		.sort();
	for (const holder of verifiers) {
		if (holder !== "auth") {
			blockers.push(`${holder} holds the receipt public key but does not store evidence`);
		}
	}
	if (!verifiers.includes("auth")) {
		blockers.push("the auth service holds no receipt public key, so it cannot verify what it is asked to store");
	}

	// (15) The scaling knobs are coherent, and every service says why it is
	// configured the way it is. A minimum above the maximum is a service that
	// cannot start; a service that scales to zero must say so out loud, because
	// a cold start in front of a checkout is a decision and not a default.
	for (const planned of plan.services) {
		if (planned.minInstances < 0) {
			blockers.push(`${planned.name} has a negative minimum instance count`);
		}
		if (planned.minInstances > planned.maxInstances) {
			blockers.push(`${planned.name} cannot scale below ${planned.minInstances} and above ${planned.maxInstances} at the same time`);
		}
		if (planned.scaleToZero !== (planned.minInstances === 0)) {
			blockers.push(`${planned.name} says it ${planned.scaleToZero ? "does" : "does not"} scale to zero, but its minimum is ${planned.minInstances}`);
		}
		if (planned.why.trim().length < 40) {
			blockers.push(`${planned.name} does not say why it scales the way it does`);
		}
		if (planned.cpuThreshold < 10 || planned.cpuThreshold > 95) {
			blockers.push(`${planned.name} scales on ${planned.cpuThreshold}% CPU, which is outside the range where the answer is useful`);
		}
		if (planned.concurrency < 1) {
			blockers.push(`${planned.name} allows ${planned.concurrency} concurrent requests per instance`);
		}
	}

	// (16) The database is backed up, the backups are kept long enough to be
	// worth having, and the instance cannot be deleted by accident. A database
	// with no automated backup is the whole of the product's evidence in one
	// disk, and a database that can be deleted with one command is one command
	// away from gone.
	if (!plan.database.backup.enabled) {
		blockers.push("the database has no automated backup");
	}
	if (plan.database.backup.fileRetentionDays < 7) {
		blockers.push(`backups are kept for ${plan.database.backup.fileRetentionDays} day(s); a weekly cycle has to survive one`);
	}
	if (plan.database.backup.transactionLogRetentionDays < 1) {
		blockers.push("the transaction log is not retained, so a point-in-time restore can only go back to the last dump");
	}
	if (!plan.database.backup.pointInTimeRecovery) {
		blockers.push("point-in-time recovery is off, so a mistake is only recoverable from the last dump");
	}
	if (!plan.database.deletionProtection) {
		blockers.push("the database instance has no deletion protection");
	}

	// (17) The bill is watched. A budget with no thresholds is a number in a
	// file; thresholds are what turn it into an alert before the month ends.
	const budget = plan.observability.budget;
	if (!(budget.amount > 0)) {
		blockers.push("no budget amount is set, so nothing alerts before the money is spent");
	}
	if (budget.thresholds.length === 0) {
		blockers.push("the budget has no thresholds, so it never alerts");
	}
	for (const threshold of budget.thresholds) {
		if (threshold <= 0 || threshold > 1) {
			blockers.push(`the budget threshold ${threshold} is not a fraction of the budget`);
		}
	}
	if (plan.observability.logRetentionDays < 7) {
		blockers.push(`logs are kept for ${plan.observability.logRetentionDays} day(s), which is too short to investigate an incident`);
	}
	if (!plan.observability.uptimeCheck.path.startsWith('/health/')) {
		blockers.push('the uptime check does not ask a health endpoint');
	}

	// (18) The image is addressable, and the tag has to name a build.
	//
	// This is the check that would have caught the deploy that pointed Cloud
	// Run at a registry the pipeline never pushed to, and the deploy that used
	// a moving tag and therefore had nothing to roll back to. Both were real,
	// and both were invisible until a deploy ran against a real project.
	if (!plan.image?.repository) {
		blockers.push('the plan names no image repository, so the deploy has nowhere to pull from');
	}
	if (!plan.image?.movingTag) {
		blockers.push('the plan names no moving tag');
	}
	if (plan.image && plan.image.requireImmutableTag === false) {
		blockers.push(
			'the plan permits a moving tag on the deployed image, and a rollback has to name one build'
		);
	}
	if (plan.image?.repository && !/^[a-z0-9][a-z0-9._-]*$/.test(plan.image.repository)) {
		blockers.push(`the image repository "${plan.image.repository}" is not a usable repository name`);
	}
	if (!plan.runtimeServiceAccount) {
		blockers.push('the plan names no account for the services to run as');
	}

	// (19) The two accounts are two accounts, and the roles are the ones the
	// plan says they are. The checks live with the module that builds the
	// commands, so the thing that is checked and the thing that is applied
	// cannot drift apart.
	blockers.push(...iamBlockers(plan));

	// (20) The budget names the environment variable that carries the billing
	// account it belongs to. A budget belongs to a billing account, not to a
	// project, so the account is the operator's and the plan only says where
	// it is read from. A budget that cannot be created alerts nobody.
	if (!plan.observability.budget.billingAccountEnv) {
		blockers.push('the budget names no environment variable for its billing account');
	} else if (!/^[A-Z][A-Z0-9_]*$/.test(plan.observability.budget.billingAccountEnv)) {
		blockers.push(
			`the budget's billing account variable "${plan.observability.budget.billingAccountEnv}" is not an environment variable name`
		);
	}

	// (21) The secrets the plan names are the ones the services are mounted
	// with, and every one of them is a secret this project creates. A secret
	// that is mounted but never created is a service that cannot start.
	for (const planned of plan.services) {
		for (const mount of planned.secrets) {
			if (!plan.secrets.some(s => s.name === mount.secret)) {
				blockers.push(`${planned.name} mounts ${mount.secret}, which the plan does not create`);
			}
		}
	}

	return blockers;
}

/**
 * The plan with its placeholders filled in, for the given peer URLs and database
 * facts. Pure: the caller supplies the values it resolved.
 */
export function fillPlan(
	plan: IPlan,
	peerUrls: Readonly<Record<string, string>>,
	database: { readonly host: string; readonly password: string }
): IPlan {
	const substitute = (value: string): string =>
		value.replace(PLACEHOLDER, (_match, name: string) => {
			if (name === 'db_host') {
				return database.host;
			}
			if (name === 'db_password') {
				return database.password;
			}
			return peerUrls[name] ?? `{{${name}}}`;
		});
	return {
		...plan,
		services: plan.services.map(s => ({
			...s,
			env: Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, substitute(v)])),
		})),
	};
}
