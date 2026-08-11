import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Countries we allow SMS to. +1 only for v1. NOTE +1 is the whole NANP, not
 * just US/Canada — it includes ~20 Caribbean nations, several of which
 * (Jamaica 876/658, Dominican Republic 809/829/849, etc.) are classic
 * premium-rate / one-ring SMS-pumping destinations. So the country-code
 * allowlist is NOT sufficient on its own; the NANP blocklist below closes the
 * gap. See REQ-SEC-18. Twilio Geo Permissions enforce this provider-side too.
 */
const ALLOWED_CALLING_CODES = new Set(["1"]);

/**
 * NANP area codes (+1) we refuse: the non-US/Canada Caribbean members that are
 * the common SMS-pumping / premium-fraud targets. Blocking these leaves the
 * legitimate US/Canada traffic while removing the fraud incentive. Expand as
 * needed; the provider-side Geo Permissions are the backstop.
 */
const BLOCKED_NANP_AREA_CODES = new Set([
  "876", "658", // Jamaica
  "809", "829", "849", // Dominican Republic
  "473", // Grenada
  "268", // Antigua & Barbuda
  "264", // Anguilla
  "242", // Bahamas
  "246", // Barbados
  "441", // Bermuda
  "284", // British Virgin Islands
  "345", // Cayman Islands
  "767", // Dominica
  "649", // Turks & Caicos
  "664", // Montserrat
  "721", // Sint Maarten
  "758", // Saint Lucia
  "784", // St Vincent & Grenadines
  "868", // Trinidad & Tobago
  "869", // St Kitts & Nevis
  "671", // Guam
  "684", // American Samoa
  "670", // Northern Mariana Islands
  "900", // premium-rate
]);

export class PhoneError extends Error {}

/**
 * Normalize a raw phone string to E.164, defaulting to US when no country is
 * given (matches how contacts are entered in this CRM). Returns the E.164
 * string, or null when the input can't be parsed into a valid number.
 */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw.trim(), "US");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164, e.g. +15551234567
}

/**
 * Normalize AND enforce the send allowlist. Throws PhoneError with a clear
 * reason on anything we refuse to text — unparseable, out-of-allowlist country,
 * or a premium/pay-per-call range. Call this before every Twilio send.
 */
export function normalizeSendableE164(raw: string | null | undefined): string {
  if (!raw) throw new PhoneError("No phone number on file for this contact.");

  const parsed = parsePhoneNumberFromString(raw.trim(), "US");
  if (!parsed || !parsed.isValid()) {
    throw new PhoneError(`"${raw}" is not a valid phone number.`);
  }

  if (!ALLOWED_CALLING_CODES.has(parsed.countryCallingCode)) {
    throw new PhoneError(
      `SMS to +${parsed.countryCallingCode} numbers is not enabled (US/Canada only).`
    );
  }

  // NANP national number is 10 digits: NXX-NXX-XXXX where N is 2-9.
  // Reject premium/fraud area codes and structurally invalid area/exchange codes.
  const national = parsed.nationalNumber; // 10 digits for +1
  if (national.length === 10) {
    const areaCode = national.slice(0, 3);
    const exchange = national.slice(3, 6);
    if (BLOCKED_NANP_AREA_CODES.has(areaCode)) {
      throw new PhoneError(
        `SMS to +1 (${areaCode}) numbers is not enabled (premium-rate or non-US/Canada range).`
      );
    }
    if (areaCode[0] === "0" || areaCode[0] === "1" || exchange[0] === "0" || exchange[0] === "1") {
      throw new PhoneError(`"${raw}" is not a valid dialable number.`);
    }
  }

  return parsed.number;
}

/**
 * The common ways a US/NANP number could already be stored in a legacy contact
 * row, derived from its E.164 form. Lets inbound-SMS contact matching use a
 * single indexed `.in("phone", candidates)` query instead of scanning every
 * contact and normalizing in JS on each unrecognized message (a CPU/spend
 * amplifier). English/NANP v1: covers E.164, 11- and 10-digit, and the usual
 * dash/paren/dot/space formats. Non-matching legacy formats fall through to a
 * new auto-created contact — acceptable and documented for v1.
 */
export function phoneMatchCandidates(e164: string): string[] {
  const set = new Set<string>([e164]);
  const digits = e164.replace(/[^\d]/g, ""); // e.g. 13105551234
  if (digits.length === 11 && digits.startsWith("1")) {
    const ten = digits.slice(1); // 3105551234
    const a = ten.slice(0, 3);
    const b = ten.slice(3, 6);
    const c = ten.slice(6);
    set.add(digits); // 13105551234
    set.add(ten); // 3105551234
    set.add(`(${a}) ${b}-${c}`); // (310) 555-1234
    set.add(`${a}-${b}-${c}`); // 310-555-1234
    set.add(`${a}.${b}.${c}`); // 310.555.1234
    set.add(`${a} ${b} ${c}`); // 310 555 1234
    set.add(`+1 (${a}) ${b}-${c}`); // +1 (310) 555-1234
  }
  return [...set];
}
