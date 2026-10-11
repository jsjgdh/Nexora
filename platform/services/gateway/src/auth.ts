import jwt from "jsonwebtoken";
import { verifyToken } from "@clerk/backend";

/* Token verification behind one interface, two backends:
   - local:  HS256 with our own secret (zero-config dev, custom auth service).
   - clerk:  Clerk session tokens via JWKS (secretKey) or pinned PEM (jwtKey).
   Services downstream never know the difference — they see x-user-id. */

export interface TokenVerifier {
  verify(token: string): Promise<string>;
}

export function localVerifier(secret: string): TokenVerifier {
  return {
    verify: async (token: string) => {
      try {
        const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
        if (typeof payload === "string" || !payload.sub || typeof payload.sub !== "string") {
          throw new Error("bad subject");
        }
        return payload.sub;
      } catch {
        throw new Error("invalid token");
      }
    },
  };
}

export function clerkVerifier(opts: {
  secretKey?: string;
  jwtKey?: string;
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
          authorizedParties: opts.authorizedParties,
        });
        const sub = (payload as { sub?: unknown }).sub;
        if (typeof sub !== "string" || !sub) throw new Error("bad subject");
        return sub;
      } catch {
        throw new Error("invalid token");
      }
    },
  };
}

export async function bearerUserId(
  authorization: string | undefined,
  verifier: TokenVerifier
): Promise<string | null> {
  if (!authorization) return null;
  const m = /^Bearer (.+)$/.exec(authorization.trim());
  if (!m) return null;
  try {
    return await verifier.verify(m[1]);
  } catch {
    return null;
  }
}
