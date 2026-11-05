import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";

/* Token verification behind one interface:
   - local:  HS256 with our own secret (zero-config dev, custom auth service).
   - kinde:  Kinde access tokens, RS256, verified against the issuer's JWKS and
             the API audience.
   Services downstream never know the difference — they see x-user-id.

   A verifier answers "who is this?" and, when the token format can name it,
   "which credential is it?" — the second is what lets the edge ask whether that
   particular token has been revoked. Kinde owns its own session revocation, and
   this platform's denylist never records a Kinde session's id, so it answers
   null there and the edge skips a check that would always be clear: it never
   invents a verification the issuer does not perform.

   Kinde mode keeps the local verifier as a narrow fallback. The desktop IDE
   signs in with a device code that a Kinde-authenticated browser approves; the
   auth service then issues that device a short-lived platform token. The web's
   tokens are Kinde's; the IDE's token is the platform's own receipt for a
   session Kinde already approved. Password login and registration are refused
   in Kinde mode, so no other local token can be minted. */

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

/**
 * Kinde access tokens, verified where Kinde publishes the keys.
 *
 * The issuer is the business's own domain (`https://acme.kinde.com`), and the
 * audience is the API registered for this platform. Both are checked: a valid
 * signature from the same Kinde business is not enough, because that business
 * may have other applications whose tokens were never meant for this service.
 *
 * The key set is fetched once and cached by jose, which also re-fetches when a
 * token names a key id it has not seen. `KINDE_JWKS_URL` exists for a sovereign
 * issuer or a local proof server; the default is Kinde's own published path.
 */
export function kindeVerifier(opts: {
  issuer: string;
  audience: string;
  jwksUrl?: string;
}): TokenVerifier {
  const issuer = opts.issuer.replace(/\/$/, "");
  if (!/^https?:\/\//.test(issuer)) throw new Error("Kinde mode needs KINDE_ISSUER_URL");
  if (!opts.audience) throw new Error("Kinde mode needs KINDE_AUDIENCE");
  const jwksUrl = opts.jwksUrl
    ? new URL(opts.jwksUrl)
    : new URL(`${issuer}/.well-known/jwks.json`);
  const keys = createRemoteJWKSet(jwksUrl);
  return {
    verify: async (token: string) => {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience: opts.audience,
          algorithms: ["RS256"],
        });
        const sub = payload.sub;
        if (typeof sub !== "string" || !sub) throw new Error("bad subject");
        // Kinde is the authority for its own sessions. The platform's denylist
        // never records a Kinde `jti`, so returning one would make the edge ask
        // a question whose answer is always "clear" — a revocation guarantee
        // that does not exist. See VerifiedToken.
        return {
          userId: sub,
          jti: null,
          expiresAtMs: typeof payload.exp === "number" ? payload.exp * 1000 : null,
          issuedAtMs: typeof payload.iat === "number" ? payload.iat * 1000 : null,
        };
      } catch {
        throw new Error("invalid token");
      }
    },
  };
}

/** The JWT header's `alg`, read only to route a token to the verifier that can
    check it. The verifier still decides whether the token is genuine. */
function algorithmOf(token: string): string | null {
  const part = token.split(".")[0];
  if (!part) return null;
  try {
    const header = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      alg?: unknown;
    };
    return typeof header.alg === "string" ? header.alg : null;
  } catch {
    return null;
  }
}

/**
 * Two kinds of token in one deployment, routed by their signing algorithm.
 *
 * Kinde signs RS256; the platform's device-code handoff signs HS256. Trying the
 * Kinde verifier first on an HS256 token would fetch a JWKS only to reject it,
 * so the header picks the door and the chosen verifier still does the work.
 * A token that names any other algorithm is refused without a fallback.
 */
export function compositeVerifier(primary: TokenVerifier, fallback: TokenVerifier): TokenVerifier {
  return {
    verify: async (token: string) => {
      const alg = algorithmOf(token);
      if (alg === "RS256") return primary.verify(token);
      if (alg === "HS256") return fallback.verify(token);
      throw new Error("invalid token");
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
