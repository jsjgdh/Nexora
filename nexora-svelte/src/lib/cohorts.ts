/* The cohort surface, in types.
 *
 * A cohort is a group of learners, in one course, in one term, taught by one
 * instructor, under one licence. The platform owns it, the auth service holds
 * it, and this module is the front door's reading of what it says.
 *
 * Three rules this file keeps.
 *
 *   - The course a cohort is for is named from the copy module, never from the
 *     platform. The platform sends a course id, and the site turns it into a
 *     title it can defend.
 *   - A status is one of three words, and nothing else. A fourth status would
 *     be a thing the pages cannot describe, so the type is closed.
 *   - A failure is never a fact. `joinFailure` turns the platform's answer
 *     into a kind, and the page picks a sentence for that kind. A page that
 *     printed the platform's raw wording would leak its vocabulary into the
 *     house, and would say "unknown" where it should have said "full". */

import { COURSES } from "./content/site";
import { errorCode, errorStatus } from "./auth-errors";

/** The three states of a licence. Only the second one carries entitlement. */
export type CohortStatus = "pending" | "active" | "ended";

/** A cohort, as the platform publishes it. */
export interface Cohort {
  id: string;
  name: string;
  institution: string;
  courseId: string;
  term: string;
  status: CohortStatus;
  seats: number;
  perStudentCents: number;
  joinCode: string;
  memberCount: number;
  createdAt: string;
}

/** One piece of work the platform has verified for a member. */
export interface CohortProof {
  competencyId: string;
  level: string;
  kind: string;
  issuedAt: string;
}

/** One member of a cohort. */
export interface CohortMember {
  userId: string;
  email: string;
  name: string;
  joinedAt: string;
  proofs: CohortProof[];
}

/** A cohort, with its roster. */
export interface CohortDetail {
  cohort: Cohort;
  members: CohortMember[];
}

/** The answer to a join. */
export interface CohortJoin {
  cohort: Cohort;
  alreadyMember: boolean;
}

/**
 * The title of a course, from the copy module.
 *
 * The platform sends an id and the site owns the name. A course the site does
 * not ship has no title, and then the id is printed, because printing a
 * title the site cannot defend would be worse.
 */
export function courseTitle(courseId: string): string {
  return COURSES.find((course) => course.slug === courseId)?.title ?? courseId;
}

/** Whether the site names this course at all. */
export function knowsCourse(courseId: string): boolean {
  return COURSES.some((course) => course.slug === courseId);
}

/**
 * The kinds of failure a join can have, so the page can say one thing about
 * each of them in plain sentences.
 */
export type JoinFailure =
  | "unknown"
  | "expired"
  | "ended"
  | "full"
  | "refused"
  | "platform";

/**
 * The kind of failure, read from the platform's own code and status.
 *
 * The platform's codes are the contract's, and they are known: an unknown code
 * is a 404, an ended licence is a 410, and a cohort with no room left is a
 * 409. The codes are read as well as the statuses, because a code says more
 * than a status does, and because the statuses alone would call an ended
 * licence an expired code.
 *
 * A failure with no status at all is an outage, and it is reported as one:
 * the platform not answering is not the same as the platform saying no.
 */
export function joinFailure(error: unknown): JoinFailure {
  const code = errorCode(error).toLowerCase();
  const status = errorStatus(error);
  if (code.includes("expired")) return "expired";
  if (code.includes("licence_ended") || code.includes("cohort_ended")) return "ended";
  if (code.includes("full") || code.includes("capacity") || code.includes("no_seat")) return "full";
  if (
    code.includes("not_found") ||
    code.includes("unknown") ||
    code.includes("invalid_code") ||
    code.includes("invalid_join_code") ||
    code.includes("not_known")
  ) {
    return "unknown";
  }
  if (status === 404) return "unknown";
  if (status === 410) return "ended";
  if (status === 409) return "full";
  if (status === 0) return "platform";
  return "refused";
}
