import jwt from "jsonwebtoken";
import { verifyToken } from "@clerk/backend";

/* Token verification behind one interface, two backends:
   - local:  HS256 with our own secret (zero-config dev, custom auth service).
   - clerk:  Clerk session tokens via JWKS (secretKey) or pinned PEM (jwtKey).
   Services downstream never know the difference — they see x-user-id.

   A verifier answers "who is this?" and, when the token format can name it,
   "which credential is it?" — the second is what lets the edge ask whether that
   particular token has been revoked. Clerk owns its own session revocation and
   its tokens carry no id we can look up, so it answers null there and the edge
   skips the check: it never invents a verification the issuer does not perform. */

export interface VerifiedToken {
  userId: string;
  /** The token's own id when the format carries one; null when it does not. */
  jti: string | null;
  /** When this token stops mattering, for bounding a cache. Null if unstated. */
  expiresAtMs: number | null;
  /**
   * When the token was issued, which is what an account-wide sign-out is compared
   * against: a token minted after the learner ended every session is a session they
   * asked for. Null when the format states no `iat`, and then that half of the
   * denylist cannot be evaluated for this token at all.
   */
  issuedAtMs: number | null;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/** Read `jti`/`exp`/`iat` off a decoded payload, tolerating a token without them. */
function claimsOf(payload: string | jwt.JwtPayload): Omit<VerifiedToken, "userId"> {
  const p = payload as { jti?: unknown; exp?: unknown; iat?: unknown };
  const seconds = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v * 1000 : null;
  return {
    jti: typeof p.jti === "string" && p.jti.length > 0 ? p.jti : null,
    expiresAtMs: seconds(p.exp),
    issuedAtMs: seconds(p.iat),
  };
}

export function localVerifier(secret: string): TokenVerifier {
  return {
    verify: async (token: string) => {
      try {
        const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
        if (typeof payload === "string" || !payload.sub || typeof payload.sub !== "string") {
          throw new Error("bad subject");
        }
        return { userId: payload.sub, ...claimsOf(payload) };
      } catch {
        throw new Error("invalid token");
      }
    },
  };
}

export function clerkVerifier(opts: {
  secretKey?: string;
  jwtKey?: string;
  /** Backend API base; empty/undefined means Clerk's hosted default. This is the
      address the JWKS signing keys are fetched from when a pinned PEM is not in
      use, so a self-hosted or sovereign Clerk is reachable and the HTTP key path
      can be exercised against a local issuer. */
  apiUrl?: string;
  authorizedParties: string[];
}): TokenVerifier {
  if (!opts.secretKey && !opts.jwtKey) {
    throw new Error("Clerk mode needs CLERK_SECRET_KEY or CLERK_JWT_KEY");
  }
  return {
    verify: async (token: string) => {
      try {
        const payload = await verifyToken(token, {
          ...(opts.secretKey ? { secretKey: opts.secretKey } : {}),
          ...(opts.jwtKey ? { jwtKey: opts.jwtKey } : {}),
          ...(opts.apiUrl ? { apiUrl: opts.apiUrl } : {}),
          authorizedParties: opts.authorizedParties,
        });
        const sub = (payload as { sub?: unknown }).sub;
        if (typeof sub !== "string" || !sub) throw new Error("bad subject");
        // jti/exp/iat are deliberately not read: Clerk is the authority for its
        // own sessions, and a local denylist keyed on a Clerk id would be a
        // revocation story that quietly does not work (see VerifiedToken).
        return { userId: sub, jti: null, expiresAtMs: null, issuedAtMs: null };
      } catch {
        throw new Error("invalid token");
      }
    },
  };
}

/**
 * The verified identity behind an `Authorization: Bearer …` header, or null when
 * there is nothing usable there (absent header, wrong scheme, bad signature,
 * expired, unreadable subject). Never throws: every caller treats "no identity"
 * as 401, and a thrown parse error would be a 500 on a client's bad token.
 */
export async function bearerIdentity(
  authorization: string | undefined,
  verifier: TokenVerifier
): Promise<VerifiedToken | null> {
  if (!authorization) return null;
  const m = /^Bearer (.+)$/.exec(authorization.trim());
  if (!m) return null;
  try {
    return await verifier.verify(m[1]);
  } catch {
    return null;
  }
}
