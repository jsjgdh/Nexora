import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

function rounds(): number {
  const v = Number(process.env.BCRYPT_ROUNDS ?? "12");
  return Number.isFinite(v) && v >= 4 && v <= 15 ? Math.floor(v) : 12;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, rounds());
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false; // malformed hash can never authenticate
  }
}

export function jwtSecret(): string {
  const s = process.env.AUTH_JWT_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_JWT_SECRET must be at least 32 characters");
  return s;
}

export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const expiresIn = 15 * 60;
  const token = jwt.sign({ sub: userId }, jwtSecret(), { algorithm: "HS256", expiresIn });
  return { token, expiresIn };
}

/** Opaque refresh token (random, stored only as a hash — never reversible). */
export function newRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
  if (typeof payload === "string" || !payload.sub || typeof payload.sub !== "string") {
    throw new Error("invalid token subject");
  }
  return payload.sub;
}
