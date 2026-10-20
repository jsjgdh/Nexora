/* Whether there is a desktop build, and what the one download action says.
 *
 * There is exactly one switch for this: `PUBLIC_IDE_DOWNLOAD_URL`. A hosted
 * installer means the download is real. An unset variable means it is not, and
 * the site says so rather than offering a button that goes nowhere.
 *
 * The label lives here rather than in the copy module because it is the one
 * piece of copy that depends on the state of the world. The same intent is
 * called the same thing everywhere, and it changes only when the product
 * changes: the hero, the header, the footer, the pricing page and the
 * download page all read this one function, so they cannot disagree about
 * whether a build exists. A site that says "try it free" over a build that is
 * not published is the exact failure this module exists to prevent.
 *
 * This module is pure. It reads no environment and touches no global, so the
 * suite can drive it with both states and assert that neither one can promise
 * a build that is not there. The environment is read once, on the server, in
 * `+layout.server.ts`, so the state a reader is served is decided before the
 * first byte and cannot change under them after hydration. */

import { RELEASE_NOTES } from "./content/site";

export type ReleaseState = {
  /** True when a hosted installer is configured, and the download page will link it. */
  available: boolean;
  /** The hosted installer, when there is one. Empty otherwise. */
  downloadUrl: string;
  /** The one label for the download action, in this state. */
  label: string;
  /** The same label, short enough for a button in the chrome. */
  labelShort: string;
  /** A sentence saying what is true of the product today. */
  note: string;
};

/**
 * The two labels. There are two and not one because the action is different:
 * with a build, the reader can take it now; without one, the reader can ask
 * to be told. Calling both of them "try it free" would promise a product that
 * does not exist, and calling both of them "get the IDE when it ships" would
 * hide a product that does.
 */
export const DOWNLOAD_LABEL = {
  available: "Download the IDE",
  announced: "Get the IDE when it ships",
} as const;

export const DOWNLOAD_LABEL_SHORT = {
  available: "Download",
  announced: "Get the IDE",
} as const;

/**
 * The state of the release, from the one switch.
 *
 * Absent, empty and whitespace-only all mean "not configured", and an unset
 * variable must never throw. The defensive read is the same idiom the rest of
 * the site uses for every public variable.
 */
export function releaseState(raw: string | null | undefined): ReleaseState {
  const downloadUrl = (raw ?? "").trim();
  const available = downloadUrl.length > 0;
  return {
    available,
    downloadUrl,
    label: available ? DOWNLOAD_LABEL.available : DOWNLOAD_LABEL.announced,
    labelShort: available ? DOWNLOAD_LABEL_SHORT.available : DOWNLOAD_LABEL_SHORT.announced,
    note: available ? RELEASE_NOTES.available : RELEASE_NOTES.announced,
  };
}
