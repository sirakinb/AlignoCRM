import { describe, it, expect } from "vitest";
import { stripQuotedReply, QUOTE_DELIMITERS } from "@/lib/messaging/quote-strip";

describe("stripQuotedReply — v1 delimiter list (P2-24)", () => {
  it("exposes the delimiters as an enumerated constant", () => {
    expect(QUOTE_DELIMITERS.length).toBe(6);
  });

  it("1. 'On … wrote:'", () => {
    const body = "Thanks, that works.\n\nOn Mon, Aug 5, 2026 at 9:00 AM, Jane <j@x.com> wrote:\n> old text";
    expect(stripQuotedReply(body)).toBe("Thanks, that works.");
  });

  it("2. -----Original Message-----", () => {
    const body = "See below.\n-----Original Message-----\nFrom: someone\nblah";
    expect(stripQuotedReply(body)).toBe("See below.");
  });

  it("3. From:/Sent: header block", () => {
    const body = "My reply here.\n\nFrom: Someone\nSent: Tuesday\nTo: me\nquoted";
    expect(stripQuotedReply(body)).toBe("My reply here.");
  });

  it("4. leading > quoted runs", () => {
    const body = "New reply.\n> quoted line one\n> quoted line two";
    expect(stripQuotedReply(body)).toBe("New reply.");
  });

  it("5. ________ separator", () => {
    const body = "Reply text.\n________________\nFrom the archive";
    expect(stripQuotedReply(body)).toBe("Reply text.");
  });
});

describe("stripQuotedReply — limits and safety", () => {
  it("P2-24b: non-English quote header is NOT stripped (documented v1 gap)", () => {
    const body = "Ma réponse.\n\nLe 5 août 2026, Jean <j@x.com> a écrit :\ntexte cité";
    expect(stripQuotedReply(body)).toBe(body.trim());
  });

  it("P2-25: no quoted history → returns the original text", () => {
    const body = "Just a plain message with no quote.";
    expect(stripQuotedReply(body)).toBe(body);
  });

  it("P2-25: stripping everything keeps the full text rather than emptying it", () => {
    const body = "> quoted only, no new reply";
    expect(stripQuotedReply(body)).toBe(body);
  });

  it("handles null/empty without throwing", () => {
    expect(stripQuotedReply(null)).toBe("");
    expect(stripQuotedReply("")).toBe("");
  });
});
