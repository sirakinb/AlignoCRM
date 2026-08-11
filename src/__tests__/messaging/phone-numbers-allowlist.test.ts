import { describe, it, expect } from "vitest";
import {
  assertAllowedAreaCode,
  PhoneNumberError,
} from "@/lib/messaging/phone-numbers";

describe("assertAllowedAreaCode", () => {
  it("allows common US area codes", () => {
    expect(() => assertAllowedAreaCode("415")).not.toThrow();
    expect(() => assertAllowedAreaCode("212")).not.toThrow();
  });

  it("rejects blocked NANP / premium area codes", () => {
    expect(() => assertAllowedAreaCode("876")).toThrow(PhoneNumberError);
    expect(() => assertAllowedAreaCode("900")).toThrow(PhoneNumberError);
  });

  it("rejects malformed area codes", () => {
    expect(() => assertAllowedAreaCode("41")).toThrow(PhoneNumberError);
    expect(() => assertAllowedAreaCode("abcd")).toThrow(PhoneNumberError);
  });
});
