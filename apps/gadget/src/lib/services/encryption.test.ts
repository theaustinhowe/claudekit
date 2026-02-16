import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/services/encryption";

const TEST_KEY = crypto.randomBytes(32).toString("hex");

describe("encrypt / decrypt", () => {
  it("round-trips a simple string", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips a single character", () => {
    const encrypted = encrypt("a", TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe("a");
  });

  it("round-trips unicode text", () => {
    const plaintext = "emoji: \u{1F680}\u{1F30D} and \u00FC\u00F1\u00EE\u00E7\u00F6\u00F0\u00E9";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips a long string", () => {
    const plaintext = "x".repeat(10000);
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const plaintext = "determinism check";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("encrypted output has iv:authTag:ciphertext format", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const parts = encrypted.split(":");
    parts[2] = "00".repeat(parts[2].length / 2);
    expect(() => decrypt(parts.join(":"), TEST_KEY)).toThrow();
  });

  it("throws on invalid encrypted format (missing parts)", () => {
    expect(() => decrypt("onlyonepart", TEST_KEY)).toThrow("Invalid encrypted format");
  });

  it("throws on invalid encrypted format (two parts)", () => {
    expect(() => decrypt("part1:part2", TEST_KEY)).toThrow("Invalid encrypted format");
  });

  it("throws with wrong key", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    const wrongKey = crypto.randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });
});
