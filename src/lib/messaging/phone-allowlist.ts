/**
 * NANP area codes blocked for SMS send AND number purchase (mirrors phone.ts).
 * Kept in a tiny module so phone-numbers.ts can import without pulling
 * libphonenumber into edge-sensitive paths unnecessarily.
 */
export const BLOCKED_NANP_AREA_CODES_PUBLIC = new Set([
  "876",
  "658", // Jamaica
  "809",
  "829",
  "849", // Dominican Republic
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
