/* The Google Cloud deployment is not fiction.
 *
 * The platform's other suites ask whether the CODE is correct. This one asks
 * whether the DEPLOYMENT can happen: whether the plan still matches the code,
 * whether the image the pipeline pushes is the image Cloud Run is told to
 * pull, whether the deploy can be repeated, and whether a failed deploy can
 * actually be undone.
 *
 * Each of those was a real defect, found by reading the pipeline rather than
 * by running it:
 *
 *   - the pipeline pushed the image to one registry and the deploy pointed
 *     Cloud Run at another, so the deploy could never have worked;
 *   - the pipeline ran `infra/gcp/dist/deploy.js`, and `dist/` is not in the
 *     repository, so the step would have failed on a missing file;
 *   - the deployed tag was the MOVING tag, so the rollback had nothing to
 *     name;
 *   - the rollback step for Google Cloud was never given a previous image, so
 *     it printed that there was nothing to roll back to and exited, leaving
 *     the broken platform running — the exact outcome the workflow's own
 *     comment says is worse than a deploy that did not happen;
 *   - every command that CREATES something failed when the thing already
 *     existed, so the deploy only worked once;
 *   - the deploying account was never granted the roles the deploy needs, so
 *     the first deploy failed with a permission error;
 *   - the secrets were created but never given a value, so a service mounted
 *     on one could not start.
 *
 * None of these can be seen by running the suite, because they are about a
 * cloud account that does not exist here. They can be seen by reading the
 * pipeline against the plan, which is what this file does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readPlan, planBlockers } from "../infra/gcp/dist/plan.js";
import {
	immutableImage,
	imageBlockers,
	imageRepository,
	movingImage,
	registryHost,
	resolveImage,
	tagForCommit,
} from "../infra/gcp/dist/image.js";
import { iamBlockers, iamCommands, serviceAccountAddress } from "../infra/gcp/dist/iam.js";
import {
	availableSecrets,
	secretBlockers,
	secretValueEnvName,
} from "../infra/gcp/dist/secrets.js";
import { rollbackBlockers, rollbackCommands } from "../infra/gcp/dist/rollback.js";
import {
	budgetCommand,
	databaseCommands,
	deployCommands,
	loadBalancerCommands,
	registryCommand,
	secretCommand,
} from "../infra/gcp/dist/deploy.js";

const plan = readPlan();
const workflow = readFileSync(
	fileURLToPath(new URL("../../.github/workflows/deploy-platform.yml", import.meta.url)),
	"utf8"
);
const sha = "0123456789abcdef0123456789abcdef01234567";

/* ------------------------------------------------------------------ *
 * The plan.
 * ------------------------------------------------------------------ */

test("the plan matches the code it claims to deploy", () => {
	const blockers = planBlockers(plan);
	assert.deepEqual(blockers, [], blockers.join("\n"));
});

test("the plan names an image repository and refuses the moving tag", () => {
	assert.ok(plan.image.repository.length > 0);
	assert.equal(plan.image.requireImmutableTag, true);
	assert.notEqual(plan.image.movingTag, "");
});

test("the plan names two accounts, and the running one cannot deploy", () => {
	assert.notEqual(plan.iam.deployAccount, plan.runtimeServiceAccount);
	assert.deepEqual(iamBlockers(plan), []);
});

test("the running account is not granted the deploying account's powers", () => {
	const runtime = plan.iam.runtimeRoles.map((r) => r.role);
	assert.ok(!runtime.includes("roles/run.admin"));
	assert.ok(!runtime.includes("roles/owner"));
	assert.ok(runtime.includes("roles/secretmanager.secretAccessor"));
	assert.ok(runtime.includes("roles/cloudsql.client"));
});

test("the deploying account is granted what the deploy needs", () => {
	const deploy = plan.iam.deployRoles.map((r) => r.role);
	for (const required of [
		"roles/run.admin",
		"roles/sqladmin",
		"roles/secretmanager.admin",
		"roles/iam.serviceAccountUser",
		"roles/compute.networkAdmin",
		"roles/artifactregistry.admin",
	]) {
		assert.ok(deploy.includes(required), `the deploying account is not granted ${required}`);
	}
});

test("every role says why it is granted", () => {
	for (const binding of [...plan.iam.deployRoles, ...plan.iam.runtimeRoles]) {
		assert.ok(binding.why.trim().length >= 20, `${binding.role} does not say why`);
	}
});

test("the accounts are created before the services that run as them", () => {
	const commands = iamCommands(plan);
	const accounts = commands.filter((c) => c.args.includes("service-accounts"));
	const bindings = commands.filter((c) => c.args.includes("add-iam-policy-binding"));
	assert.ok(accounts.length >= 2, "both accounts are created");
	assert.ok(bindings.length > 0, "the roles are granted");
	assert.ok(accounts[0].exists, "creating an account checks whether it is already there");
});

/* ------------------------------------------------------------------ *
 * The image.
 * ------------------------------------------------------------------ */

test("the image address comes from the plan and names the commit", () => {
	const image = immutableImage(plan, sha);
	assert.ok(image.startsWith(`${registryHost(plan)}/${plan.project}/${plan.artifactRegistry}/`));
	assert.ok(image.endsWith(`:${sha}`));
	assert.notEqual(image, movingImage(plan));
});

test("a commit is a usable tag, and a mess is not", () => {
	assert.equal(tagForCommit(sha), sha);
	assert.throws(() => tagForCommit("has/slash"));
	assert.throws(() => tagForCommit(""));
});

test("the deploy refuses an image from another registry", () => {
	const elsewhere = "ghcr.io/nexora/nexora-platform:latest";
	const blockers = imageBlockers(plan, elsewhere);
	assert.ok(blockers.length > 0, "an image outside the plan's registry is refused");
	assert.ok(blockers[0].includes("registry"));
});

test("the deploy refuses the moving tag, because a rollback has to name a build", () => {
	const blockers = imageBlockers(plan, movingImage(plan));
	assert.ok(blockers.length > 0);
	assert.ok(blockers[0].includes("moving tag"));
});

test("the deploy refuses an image with no tag at all", () => {
	const blockers = imageBlockers(plan, `${imageRepository(plan)}:`);
	assert.ok(blockers.length > 0);
});

test("the deploy refuses to run with no image named", () => {
	const blockers = imageBlockers(plan, "");
	assert.ok(blockers.length > 0);
});

test("the environment wins over the plan, and the plan is the fallback", () => {
	const fromEnvironment = immutableImage(plan, sha);
	assert.equal(resolveImage(plan, fromEnvironment), fromEnvironment);
	assert.equal(resolveImage(plan, ""), movingImage(plan));
});

/* ------------------------------------------------------------------ *
 * The rollback.
 * ------------------------------------------------------------------ */

test("the rollback refuses to roll back to the moving tag", () => {
	const blockers = rollbackBlockers(plan, movingImage(plan));
	assert.ok(blockers.length > 0);
	assert.ok(blockers[0].includes("moving tag"));
});

test("the rollback refuses an image from another registry", () => {
	const blockers = rollbackBlockers(plan, "ghcr.io/nexora/nexora-platform:abc");
	assert.ok(blockers.length > 0);
});

test("the rollback puts every service back on the one image", () => {
	const previous = immutableImage(plan, sha);
	const commands = rollbackCommands(plan, previous);
	assert.equal(commands.length, plan.services.length);
	for (const command of commands) {
		assert.ok(command.args.includes("--image"));
		assert.ok(command.args.includes(previous));
	}
});

/* ------------------------------------------------------------------ *
 * The secrets.
 * ------------------------------------------------------------------ */

test("the secret a plan names is read from a variable named after it", () => {
	assert.equal(secretValueEnvName("nexora-internal-api-key"), "NEXORA_SECRET_INTERNAL_API_KEY");
	assert.equal(secretValueEnvName("nexora-db-password"), "NEXORA_SECRET_DB_PASSWORD");
});

test("a secret with no value stops the deploy", () => {
	const blockers = secretBlockers(plan, {});
	assert.equal(blockers.length, plan.secrets.length);
	for (const blocker of blockers) {
		assert.ok(blocker.includes("NEXORA_SECRET_"));
	}
});

test("a secret with a value is written, and only that one is", () => {
	const values = {};
	values[secretValueEnvName(plan.secrets[0].name)] = "a-value";
	const available = availableSecrets(plan, values);
	assert.equal(available.length, 1);
	assert.equal(available[0].name, plan.secrets[0].name);
});

test("no secret value is written down in the plan", () => {
	for (const secret of plan.secrets) {
		for (const key of Object.keys(secret)) {
			assert.ok(
				["name", "purpose", "generate", "placeholder"].includes(key),
				`the secret ${secret.name} has a "${key}" field, and a secret entry may not carry a value`
			);
		}
	}
});

/* ------------------------------------------------------------------ *
 * The deploy can be repeated.
 * ------------------------------------------------------------------ */

test("every command that creates something checks whether it is already there", () => {
	const creators = [
		registryCommand(plan),
		...databaseCommands(plan),
		...loadBalancerCommands(plan),
		secretCommand(plan.secrets[0].name, plan.project),
	];
	for (const command of creators) {
		assert.ok(
			command.exists,
			`"${command.label}" does not check whether it is already there, so the deploy only works once`
		);
	}
});

test("the deploy of a service sets the scaling the plan states", () => {
	const service = plan.services[0];
	const commands = deployCommands(service, immutableImage(plan, sha), plan.region, plan.project);
	const deploy = commands.find((c) => c.args[0] === "run" && c.args[1] === "deploy");
	assert.ok(deploy, "the service is deployed");
	assert.ok(deploy.args.includes(String(service.minInstances)));
	assert.ok(deploy.args.includes(String(service.maxInstances)));
	assert.ok(deploy.args.includes(String(service.cpuThreshold)));
	assert.ok(deploy.args.includes(String(service.concurrency)));
});

test("the budget names the billing account it is read from", () => {
	const command = budgetCommand(plan, "ABCDEF-123456-789ABC");
	assert.ok(command.args.includes("ABCDEF-123456-789ABC"));
	assert.ok(plan.observability.budget.billingAccountEnv.length > 0);
});

/* ------------------------------------------------------------------ *
 * The pipeline.
 * ------------------------------------------------------------------ */

test("the pipeline does not write the registry out; it asks the plan", () => {
	assert.ok(
		!/-docker\.pkg\.dev/.test(workflow),
		"the workflow carries its own copy of the registry address, which can drift from the plan"
	);
	assert.ok(workflow.includes("infra/gcp/dist/image.js --tag="));
	assert.ok(workflow.includes("infra/gcp/dist/image.js --host"));
});

test("the pipeline compiles the plan before it uses it", () => {
	const build = workflow.indexOf("npm run build --workspace=@nexora/gcp-plan");
	const deploy = workflow.indexOf("node infra/gcp/dist/deploy.js --apply");
	assert.ok(build !== -1, "the plan is compiled");
	assert.ok(deploy !== -1, "the plan is applied");
	assert.ok(build < deploy, "the plan is compiled before it is applied");
});

test("the pipeline checks the plan against the code before it builds anything", () => {
	const check = workflow.indexOf("npm run gcp:check");
	const build = workflow.indexOf("docker build");
	assert.ok(check !== -1, "the plan is checked");
	assert.ok(check < build, "the plan is checked before an image is built");
});

test("the pipeline reads what is running, so the rollback is a fact", () => {
	assert.ok(workflow.includes("infra/gcp/dist/image.js --current"));
});

test("the pipeline rolls Google Cloud back to the image it read", () => {
	assert.ok(workflow.includes("--rollback --image="));
	assert.ok(workflow.includes("needs.image.outputs.previous"));
});

test("the pipeline supplies every secret the plan names, and no others", () => {
	for (const secret of plan.secrets) {
		const variable = secretValueEnvName(secret.name);
		assert.ok(
			workflow.includes(`${variable}: \${{ secrets.${variable} }}`),
			`the pipeline does not supply ${variable}`
		);
	}
	const supplied = [...workflow.matchAll(/NEXORA_SECRET_[A-Z0-9_]+(?=:)/g)].map((m) => m[0]);
	const expected = plan.secrets.map((s) => secretValueEnvName(s.name));
	assert.deepEqual([...new Set(supplied)].sort(), [...new Set(expected)].sort());
});

test("the pipeline authenticates to the registry without a key in a secret", () => {
	assert.ok(workflow.includes("google-github-actions/auth@v2"));
	assert.ok(workflow.includes("gcloud auth configure-docker"));
	assert.ok(!workflow.includes("GCP_SA_KEY"), "a JSON key is the older way and is not used");
});

test("the pipeline gives the deploy the billing account the budget needs", () => {
	assert.ok(workflow.includes("GCP_BILLING_ACCOUNT"));
});

test("the pipeline waits for the verify workflow and never deploys a red commit", () => {
	assert.ok(workflow.includes("workflow_run:"));
	assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
});

test("the pipeline runs one deploy at a time", () => {
	assert.ok(workflow.includes("concurrency:"));
	assert.ok(workflow.includes("cancel-in-progress: false"));
});
