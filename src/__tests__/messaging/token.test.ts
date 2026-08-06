import { describe, it, expect, beforeEach } from "vitest";

// The token module reads MESSAGING_TOKEN_SECRET lazily on each sign/verify, so
// setting it before the calls is sufficient.
process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

import {
  signUnsubToken,
  verifyUnsubToken,
  signJobToken,
  verifyJobToken,
} from "@/lib/messaging/token";

describe("unsubscribe tokens (REQ-SEC-08)", () => {
  it("round-trips a valid token and carries the payload", () => {
    const token = signUnsubToken({
      workspaceId: "ws-a",
      channel: "email",
      address: "jane@example.com",
      campaignId: "camp-1",
    });
    const payload = verifyUnsubToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.w).toBe("ws-a");
    expect(payload?.c).toBe("email");
    expect(payload?.a).toBe("jane@example.com");
    expect(payload?.cid).toBe("camp-1");
  });

  it("rejects a single-character signature flip", () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "x@y.z" });
    const parts = token.split(".");
    const sig = parts[2];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${flipped}`;
    expect(verifyUnsubToken(tampered)).toBeNull();
  });

  it("rejects a tampered payload (different address) with the original signature", () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "victim@y.z" });
    const parts = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ w: "ws-a", c: "email", a: "attacker@y.z", exp: 9999999999 })
    ).toString("base64url");
    const forged = `${parts[0]}.${forgedPayload}.${parts[2]}`;
    expect(verifyUnsubToken(forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "x@y.z" });
    process.env.MESSAGING_TOKEN_SECRET = "a-completely-different-secret".padEnd(40, "z");
    expect(verifyUnsubToken(token)).toBeNull();
    process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");
  });

  it("rejects an expired token", () => {
    // Hand-craft a token with a past exp using the same secret.
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "x@y.z" });
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    payload.exp = Math.floor(Date.now() / 1000) - 10;
    // Re-sign with the (known test) secret so the signature is valid but exp is past.
    const { createHmac } = require("node:crypto");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", process.env.MESSAGING_TOKEN_SECRET)
      .update(`v1.${body}`)
      .digest("base64url");
    expect(verifyUnsubToken(`v1.${body}.${sig}`)).toBeNull();
  });

  it("refuses to sign when the secret is unset/short (fails closed, P5-05b)", () => {
    const prev = process.env.MESSAGING_TOKEN_SECRET;
    delete process.env.MESSAGING_TOKEN_SECRET;
    expect(() =>
      signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "x@y.z" })
    ).toThrow();
    process.env.MESSAGING_TOKEN_SECRET = prev;
  });
});

describe("campaign job tokens (REQ-SEC-16)", () => {
  it("round-trips a valid job token", () => {
    const token = signJobToken({ campaignId: "c1", workspaceId: "ws-a", chunk: 1 });
    const payload = verifyJobToken(token);
    expect(payload?.campaignId).toBe("c1");
    expect(payload?.workspaceId).toBe("ws-a");
    expect(payload?.chunk).toBe(1);
  });

  it("rejects a tampered job token", () => {
    const token = signJobToken({ campaignId: "c1", workspaceId: "ws-a", chunk: 1 });
    const parts = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ campaignId: "c2", workspaceId: "ws-a", chunk: 1, exp: 9999999999 })
    ).toString("base64url");
    expect(verifyJobToken(`${parts[0]}.${forged}.${parts[2]}`)).toBeNull();
  });

  it("rejects an expired job token", () => {
    const { createHmac } = require("node:crypto");
    const payload = { campaignId: "c1", workspaceId: "ws-a", chunk: 1, exp: Math.floor(Date.now() / 1000) - 5 };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", process.env.MESSAGING_TOKEN_SECRET)
      .update(`v1.${body}`)
      .digest("base64url");
    expect(verifyJobToken(`v1.${body}.${sig}`)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyJobToken("garbage")).toBeNull();
    expect(verifyJobToken("v1.only-two")).toBeNull();
    expect(verifyJobToken("")).toBeNull();
  });
});

beforeEach(() => {
  process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");
});
