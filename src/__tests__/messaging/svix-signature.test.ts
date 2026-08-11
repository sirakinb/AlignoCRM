import { describe, it, expect } from "vitest";
import { Webhook } from "svix";
import { verifySvixSignature } from "@/lib/messaging/svix-signature";

const SECRET = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const OTHER_SECRET = "whsec_" + Buffer.from("ffffffffffffffffffffffffffffffff").toString("base64");

function sign(secret: string, body: string, when = new Date()) {
  const wh = new Webhook(secret);
  const id = "msg_test_1";
  const signature = wh.sign(id, when, body);
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": Math.floor(when.getTime() / 1000).toString(),
    "svix-signature": signature,
  });
  return headers;
}

describe("verifySvixSignature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } });

  it("accepts a correctly signed payload and returns the svix-id", () => {
    const res = verifySvixSignature(body, sign(SECRET, body), SECRET);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.eventId).toBe("msg_test_1");
  });

  it("rejects a tampered body", () => {
    const headers = sign(SECRET, body);
    const res = verifySvixSignature(body + "x", headers, SECRET);
    expect(res.ok).toBe(false);
  });

  it("rejects when svix headers are missing", () => {
    const res = verifySvixSignature(body, new Headers(), SECRET);
    expect(res.ok).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    const res = verifySvixSignature(body, sign(OTHER_SECRET, body), SECRET);
    expect(res.ok).toBe(false);
  });

  it("rejects a stale timestamp (>5 min replay window)", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const res = verifySvixSignature(body, sign(SECRET, body, old), SECRET);
    expect(res.ok).toBe(false);
  });
});
