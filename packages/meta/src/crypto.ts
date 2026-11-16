import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for Meta access tokens at rest.
 * Stored blob: iv(12B) ‖ tag(16B) ‖ ciphertext.
 */
export class TokenCrypto {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    this.key = Buffer.from(keyHex, "hex");
    if (this.key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
    }
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }

  decrypt(blob: Uint8Array): string {
    const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }
}
