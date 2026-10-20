/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One `gcloud` invocation, as data.
 *
 * It lives in its own module because every part of the deploy builds these,
 * and a module that imported the type from `deploy.ts` would make `deploy.ts`
 * and that module depend on each other. The type is the one thing they share.
 */
export interface ICommand {
	/** What this command does, in words a person reads in a log. */
	readonly label: string;
	/** The arguments, without the `gcloud` itself. */
	readonly args: readonly string[];
	/**
	 * How to ask whether this thing is already there.
	 *
	 * A create that is not checked is a deploy that only works once. The
	 * second run of the same plan fails on the first resource that already
	 * exists, which is the first command in the file, and the failure looks
	 * like a broken deploy rather than like a repeat of a good one.
	 *
	 * These are the arguments for a `describe` of the same resource. They are
	 * only used for commands that CREATE something.
	 */
	readonly exists?: readonly string[];
}
