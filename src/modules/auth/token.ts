import { jwtVerify, SignJWT } from "jose";

/** Session lifetime: one working day (docs/02-architecture.md §5). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_COOKIE = "rms_session";

export type SessionClaims = {
  /** user id */
  uid: number;
  /** users.session_version at login; a mismatch ends the session */
  sv: number;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ uid: claims.uid, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the claims, or null for a missing, tampered or expired token. */
export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "number" || typeof payload.sv !== "number") return null;
    return { uid: payload.uid, sv: payload.sv };
  } catch {
    return null;
  }
}
