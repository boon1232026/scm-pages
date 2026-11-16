import { createHash, randomBytes } from "crypto";

/** Opaque refresh token — only the SHA-256 hash is persisted. */
export function generateRefreshToken(): { token: string; hash: string; familyId: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashToken(token), familyId: randomBytes(16).toString("hex") };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
