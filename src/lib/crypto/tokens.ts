import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for OAuth tokens.
 *
 * - Key is read from OAUTH_TOKEN_ENCRYPTION_KEY once at module init.
 * - Must be 32 bytes, base64-encoded.
 * - Format: base64(iv):base64(tag):base64(ciphertext)
 * - Tokens are encrypted before DB storage and decrypted only on the server.
 */

function loadEncryptionKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY environment variable is required for token encryption."
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY is not valid base64."
    );
  }

  if (key.length !== 32) {
    throw new Error(
      `OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  return key;
}

const ENCRYPTION_KEY = loadEncryptionKey();
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Encrypt a plaintext token. Returns a deterministic object as well as the
 * single-string serialization used for storage.
 */
export function encryptToken(plain: string): { encrypted: EncryptedToken; serialized: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encrypted: EncryptedToken = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  const serialized = `${encrypted.iv}:${encrypted.tag}:${encrypted.ciphertext}`;
  return { encrypted, serialized };
}

/**
 * Encrypt a plaintext token and return only the serialized string.
 */
export function encryptTokenToString(plain: string): string {
  return encryptToken(plain).serialized;
}

/**
 * Decrypt a serialized token string back to plaintext.
 */
export function decryptToken(serialized: string): string {
  const parts = serialized.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format: expected iv:tag:ciphertext");
  }

  const [ivB64, tagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid encrypted token: IV length mismatch");
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted token: auth tag length mismatch");
  }

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * Decrypt from the structured EncryptedToken object (used in some round-trip tests).
 */
export function decryptTokenObject(encrypted: EncryptedToken): string {
  return decryptToken(`${encrypted.iv}:${encrypted.tag}:${encrypted.ciphertext}`);
}
