/* The shape of the file a learner downloads from their account.
 *
 * The account page merges what two services hold into one file, and that file
 * is an artefact a person is entitled to keep: they may read it in two years,
 * or hand it to a lawyer. So its shape is named here rather than left to the
 * order the object literal happens to have, and the keys are the same on
 * every download.
 *
 * What is in it:
 *
 *   format    the name of the format, so a reader knows what it is holding.
 *   version   the version of that format. It goes up when the shape changes.
 *   generatedAt  when the file was made.
 *   note      what the file is and which part is which, in words.
 *   parts     the halves, in order: the identity service's half first (the
 *             account, what it accepted, its verified proofs, its requests),
 *             then the billing service's half (the subscription). A half is
 *             missing only when that service could not be reached, and the
 *             note says so.
 *   billingUnavailable  null when the billing half is in the file, and the
 *             sentence to read when it is not. The key is always there: a
 *             key that is present in one file and absent in another is a
 *             reader that has to handle two shapes.
 *
 * The proof rows inside the identity service's half carry exactly the four
 * fields the IDE's reader asks for (competencyId, level, kind, issuedAt),
 * which is what makes the file something the IDE can read rather than only
 * something a person can read. */

export const ACCOUNT_EXPORT_BUNDLE_FORMAT = "nexora-account-export-bundle";

/** The bundle's version. Two: the first bundle left billingUnavailable out of the file when there was no problem to report. */
export const ACCOUNT_EXPORT_BUNDLE_VERSION = 2;

/** The bundle's top-level keys, in the order the file carries them. */
export const ACCOUNT_EXPORT_BUNDLE_KEYS = [
  "format",
  "version",
  "generatedAt",
  "note",
  "parts",
  "billingUnavailable",
] as const;
