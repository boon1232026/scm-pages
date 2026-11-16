import { describe, expect, it } from "vitest";
import { TokenCryptoService } from "./crypto.service";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const fakeConfig = { get: (k: string) => (k === "TOKEN_ENCRYPTION_KEY" ? KEY : "") } as never;

describe("TokenCryptoService (AES-256-GCM)", () => {
  const svc = new TokenCryptoService(fakeConfig);

  it("round-trips a token", () => {
    const token = "EAABwzLixnjYBOtest_token_1234567890";
    expect(svc.decrypt(svc.encrypt(token))).toBe(token);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const a = svc.encrypt("same");
    const b = svc.encrypt("same");
    expect(a.equals(b)).toBe(false);
    expect(svc.decrypt(a)).toBe(svc.decrypt(b));
  });

  it("detects tampering (GCM auth tag)", () => {
    const blob = svc.encrypt("secret-token");
    blob[blob.length - 1] ^= 0xff;
    expect(() => svc.decrypt(blob)).toThrow();
  });
});
