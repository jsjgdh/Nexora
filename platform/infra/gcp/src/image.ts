/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where the image lives, and what its name has to be.
 *
 * A Cloud Run service is deployed with the ADDRESS of an image, and the
 * address has to be in a registry the project can pull from. Artifact
 * Registry is that registry, and it is the one the plan names. Two rules
 * follow from that, and both of them are enforced here rather than trusted:
 *
 *   1. The image must live in the plan's registry. A registry the plan does
 *      not name is a registry nobody granted access to, and the deploy fails
 *      at the moment it tries to pull, which is AFTER the old revision has
 *      already been replaced. A refusal here is a refusal before anything
 *      has changed.
 *   2. The tag must name one build. A moving tag cannot be rolled back to:
 *      by the time the rollback runs, the tag points at the image that broke.
 *      So the deploy uses a tag that names one build, and the moving tag is a
 *      convenience for a human looking at the registry and never what gets
 *      deployed.
 *
 * The address is derived from the plan, never written down twice. The CI
 * workflow asks this module for the address it should push to, so the
 * workflow and the deploy cannot disagree about where the image lives.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { readPlan, type IPlan } from './plan.js';

/** The host the plan's registry is served from. */
export function registryHost(plan: IPlan): string {
	return `${plan.region}-docker.pkg.dev`;
}

/** The repository the image lives in, without a tag. */
export function imageRepository(plan: IPlan): string {
	return `${registryHost(plan)}/${plan.project}/${plan.artifactRegistry}/${plan.image.repository}`;
}

/**
 * The address of one build.
 *
 * The tag is the commit it was built from, so the address names the code and
 * not the moment.
 */
export function immutableImage(plan: IPlan, tag: string): string {
	return `${imageRepository(plan)}:${tag}`;
}

/** The address of the moving tag, for a human looking at the registry. */
export function movingImage(plan: IPlan): string {
	return `${imageRepository(plan)}:${plan.image.movingTag}`;
}

/**
 * The tag a commit produces.
 *
 * A tag is a docker tag, so it may not contain a slash and may not be empty.
 * The commit sha is used because it is already unique and already known.
 */
export function tagForCommit(sha: string): string {
	const trimmed = sha.trim();
	if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(trimmed)) {
		throw new Error(`"${sha}" is not usable as an image tag`);
	}
	return trimmed;
}

/**
 * Why an image cannot be deployed, in words.
 *
 * Empty means it can. The reasons are stated rather than thrown, because the
 * caller prints them all: one wrong image in a pipeline is a fact, and a
 * pipeline that stops at the first one hides the second.
 */
export function imageBlockers(plan: IPlan, image: string): string[] {
	const blockers: string[] = [];
	const trimmed = image.trim();
	if (!trimmed) {
		blockers.push('no image was named; the deploy has nothing to pull');
		return blockers;
	}
	const repository = imageRepository(plan);
	if (!trimmed.startsWith(`${repository}:`)) {
		blockers.push(
			`the image "${trimmed}" is not in the plan's registry (${repository}); ` +
				'Artifact Registry is the registry the project can pull from, and the plan is what says where that is'
		);
		return blockers;
	}
	const tag = trimmed.slice(repository.length + 1);
	if (plan.image.requireImmutableTag && tag === plan.image.movingTag) {
		blockers.push(
			`the image "${trimmed}" carries the moving tag; a rollback has to name a build, ` +
				'and by the time a rollback runs the moving tag points at the image that broke'
		);
	}
	if (!tag) {
		blockers.push(`the image "${trimmed}" has no tag`);
	}
	return blockers;
}

/**
 * The image the deploy should use.
 *
 * `PLATFORM_IMAGE` wins, because CI is what builds the image and it is the
 * only party that knows the commit. The plan's moving tag is the fallback
 * for a human running the deploy by hand.
 */
export function resolveImage(plan: IPlan, fromEnvironment?: string | undefined): string {
	const given = (fromEnvironment ?? process.env.PLATFORM_IMAGE ?? '').trim();
	if (given) {
		return given;
	}
	return movingImage(plan);
}

/**
 * The image the platform is running right now.
 *
 * Read from the Cloud Run API rather than remembered, because a remembered
 * image is a guess and a rollback made from a guess is a second outage. The
 * gateway is asked, because it is the service that always exists.
 *
 * Empty means nothing is running yet, which is the first deploy and not a
 * fault.
 */
export function runningImage(plan: IPlan): string {
	try {
		const out = execFileSync(
			'gcloud',
			[
				'run', 'services', 'describe', plan.loadBalancer.service,
				'--region', plan.region,
				'--project', plan.project,
				'--format', 'value(spec.template.spec.containers[0].image)',
			],
			{ encoding: 'utf8' }
		);
		return out.trim();
	} catch {
		return '';
	}
}

/**
 * The command line, so the pipeline can ask this module where the image goes.
 *
 * The workflow needs the address BEFORE it builds the image, because the
 * address is the tag. If the workflow wrote the address out itself, it would
 * be a second copy of the plan, and the two would drift — which is exactly
 * how a deploy ends up pushing to one registry and pulling from another.
 *
 *   node dist/image.js --tag=<commit>   the address to build and push
 *   node dist/image.js --current        the image the platform runs now
 *   node dist/image.js --repository     the repository, without a tag
 *   node dist/image.js --host           the registry host, for docker login
 *   node dist/image.js --moving         the moving tag, for a human
 */
function main(): void {
	const args = process.argv.slice(2);
	const plan = readPlan();
	const tag = args.find(a => a.startsWith('--tag='))?.slice('--tag='.length);

	if (args.includes('--current')) {
		const current = runningImage(plan);
		process.stdout.write(current);
		return;
	}
	if (args.includes('--repository')) {
		process.stdout.write(imageRepository(plan));
		return;
	}
	if (args.includes('--host')) {
		process.stdout.write(registryHost(plan));
		return;
	}
	if (args.includes('--moving')) {
		process.stdout.write(movingImage(plan));
		return;
	}
	if (!tag) {
		console.error('usage: node dist/image.js --tag=<commit> | --current | --repository | --host | --moving');
		process.exit(1);
	}
	process.stdout.write(immutableImage(plan, tagForCommit(tag)));
}

const isTheCommand =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isTheCommand) {
	main();
}
