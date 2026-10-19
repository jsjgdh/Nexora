import type { PublicUser } from "@nexora/contracts";

/**
 * The user shape the wire carries.
 *
 * One function, used by every route that returns a user, so the shape cannot
 * drift between them: a client that parses /me and a client that parses the
 * answer to a verification get the same object.
 */
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  created_at: Date | string;
  /**
   * When the address was confirmed.
   *
   * Optional, because the column was added after the accounts were: a row
   * that predates it reads as unverified rather than as broken, and the
   * account works exactly as it did.
   */
  email_verified_at?: Date | string | null;
}

export function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    // Optional on the wire, and present here: a client written before the
    // verification flow existed ignores the field, and a client that reads it
    // gets the truth about the address it is showing.
    emailVerified: Boolean(row.email_verified_at),
  };
}
