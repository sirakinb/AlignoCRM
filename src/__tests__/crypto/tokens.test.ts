import { describe, it, expect, vi, beforeEach } from "vitest";

// Provide a deterministic 32-byte key so the module can load.
process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");

import {
  encryptToken,
  decryptToken,
  encryptTokenToString,
} from "@/lib/crypto/tokens";

describe("token encryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("round-trips a plain token through encryption and decryption", () => {
    const plain = "super-secret-oauth-token-12345";
    const { serialized } = encryptToken(plain);
    expect(serialized).toContain(":");
    expect(decryptToken(serialized)).toBe(plain);
  });

  it("returns a structured payload with iv, tag, and ciphertext", () => {
    const plain = "another-token";
    const { encrypted } = encryptToken(plain);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).not.toBe(encrypted.ciphertext);
  });

  it("encrypts the same plain text to different ciphertexts each time", () => {
    const plain = "same-input";
    const a = encryptTokenToString(plain);
    const b = encryptTokenToString(plain);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(plain);
    expect(decryptToken(b)).toBe(plain);
  });

  it("fails to decrypt a tampered ciphertext", () => {
    const plain = "tamper-test";
    const serialized = encryptTokenToString(plain);
    const tampered = serialized.slice(0, -4) + "1234";
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("exposes no plaintext in the serialized output", () => {
    const plain = "sensitive-access-token";
    const serialized = encryptTokenToString(plain);
    expect(serialized).not.toContain(plain);
    expect(Buffer.from(serialized, "base64").toString("utf8")).not.toContain(plain);
  });
});
