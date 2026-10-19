/* What the platform's error codes mean in words.
 *
 * The platform answers with its own envelope: `{ error: { code, message } }`.
 * The codes are the contract (`platform/packages/contracts/src/index.ts` names
 * the shape, and `platform/services/auth/src/routes.ts` raises the codes), so
 * the site reads them rather than guessing from a status number.
 *
 * Why a module and not a switch in each page. A rejected sign-in, an expired
 * session and an unreachable platform are three different events, and the
 * difference matters to the learner: one of them is their fault, one of them
 * is the end of a session, and one of them is ours. A page that printed the
 * platform's raw `message` string would say three different things that all
 * read like an apology, and it would leak the platform's wording into the
 * house. The sentences here are the house's, and they are the same sentences
 * wherever the code appears, so "the sign-in service did not answer" means one
 * thing on every page.
 *
 * Two rules the sentences keep:
 *
 *   - a rejection says what was rejected, and never guesses why;
 *   - nothing here says the learner's work is gone. The IDE's work is on
 *     their own machine, and the platform never holds it, so an account
 *     problem is never a lost-work problem.
 *
 * No em dash or en dash appears in any of these strings, and none of them
 * claims a thing the product does not do. */

export interface PlatformError {
  status: number;
  code: string;
  message: string;
}

/** The code the platform sent, or "" when the failure was ours. */
export function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

/** The HTTP status behind the failure, or 0 when there was no reply. */
export function errorStatus(error: unknown): number {
  if (typeof error !== "object" || error === null) return 0;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 0;
}

/**
 * The sentences, one per event.
 *
 * Kept as data rather than as branches so a page can pick the line that
 * matches the moment it is in, and so the test suite can read the mapping
 * without driving a browser.
 */
export const AUTH_MESSAGES = {
  /** The address and password were not accepted. */
  invalidCredentials:
    "That email and password were not accepted. Check them, or set a new password.",
  /** The address already has an account. */
  conflict: "An account with this email already exists. Sign in instead, or reset the password.",
  /** Too many attempts from this address. */
  rateLimited: "Too many attempts from this address. Wait a minute, then try again.",
  /** The session is over, because the credential was refused. */
  expired:
    "That session has ended. Sign in again and pick up where you left off. Your work in the IDE is untouched.",
  /** A refresh token was replayed, so the whole family was revoked. */
  tokenReused:
    "That session was ended for safety, because its credential was used twice. Sign in again. Your work in the IDE is untouched.",
  /** The service did not answer at all. */
  unavailable:
    "The sign-in service did not answer. Nothing here depends on it: the nine free phases in the IDE work offline, and your work is saved on your own machine.",
  /** The build has no platform behind it. */
  notConfigured:
    "Accounts are not connected in this build, so nothing was sent and no account was made. The nine free phases in the IDE need no account.",
  /** The link or code was not accepted. */
  badToken:
    "That link was not accepted. It may have expired, or it may already have been used. Ask for a new one and it will arrive.",
  /** The address was refused by the platform's own rules. */
  addressNotAllowed:
    "That address cannot be used for an account here. Write to the privacy contact in the notice and the same deadlines apply from the moment it arrives.",
} as const;

export type AuthMessageKey = keyof typeof AUTH_MESSAGES;

/**
 * The sentence for a platform code.
 *
 * An unknown code is not a crash and not a leak: the platform's own message is
 * shown, because it is written for the person reading it and hiding it would
 * leave the learner with nothing. The codes the platform raises are covered
 * below; the fallback exists for the ones a future release adds.
 */
export function authMessage(error: unknown): string {
  const code = errorCode(error);
  switch (code) {
    case "invalid_credentials":
      return AUTH_MESSAGES.invalidCredentials;
    case "conflict":
      return AUTH_MESSAGES.conflict;
    case "rate_limited":
      return AUTH_MESSAGES.rateLimited;
    case "expired":
    case "invalid_grant":
    case "unauthorized":
    case "no_session":
      return AUTH_MESSAGES.expired;
    case "token_reused":
      return AUTH_MESSAGES.tokenReused;
    case "auth_unavailable":
      return AUTH_MESSAGES.unavailable;
    case "not_configured":
      return AUTH_MESSAGES.notConfigured;
    case "invalid_token":
    case "expired_token":
    case "token_expired":
    case "invalid_request":
      return AUTH_MESSAGES.badToken;
    case "address_not_allowed":
      return AUTH_MESSAGES.addressNotAllowed;
    default: {
      const message = (error as { message?: unknown } | null)?.message;
      if (typeof message === "string" && message.length > 0) return message;
      return "That did not work. Try again, and nothing you have done is lost.";
    }
  }
}

/**
 * The kind of failure, for a page that has to choose a shape rather than a
 * sentence: a rejection (the learner can act), an outage (nothing they did),
 * or a build with no platform behind it.
 */
export type AuthFailure = "rejected" | "outage" | "not-configured" | "other";

export function authFailure(error: unknown): AuthFailure {
  const code = errorCode(error);
  if (code === "not_configured") return "not-configured";
  if (code === "auth_unavailable") return "outage";
  if (
    code === "invalid_credentials" ||
    code === "conflict" ||
    code === "rate_limited" ||
    code === "address_not_allowed" ||
    code === "invalid_token" ||
    code === "expired_token" ||
    code === "token_expired" ||
    code === "invalid_request"
  ) {
    return "rejected";
  }
  const status = errorStatus(error);
  if (status === 0) return "outage";
  if (status === 401 || status === 403) return "rejected";
  return "other";
}

/**
 * True when the failure means the platform is not there at all, so a page can
 * say so plainly instead of pretending it sent something.
 */
export function isNotConfigured(error: unknown): boolean {
  return authFailure(error) === "not-configured";
}
