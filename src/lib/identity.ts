/**
 * People are identified by a mobile number, email address or in-app username. Each is normalised to a
 * single key so the same person always matches: "+919876543210", "riya@example.com" or "@riya".
 */
export type IdentityKind = "phone" | "email" | "username";

export type ParsedIdentity = { ok: true; key: string; kind: IdentityKind } | { ok: false; error: string };

export interface Country {
  code: string;
  name: string;
}

/** Calling codes offered in the picker (India first as the default). */
export const COUNTRIES: Country[] = [
  { code: "91", name: "India" },
  { code: "977", name: "Nepal" },
  { code: "880", name: "Bangladesh" },
  { code: "94", name: "Sri Lanka" },
  { code: "92", name: "Pakistan" },
  { code: "975", name: "Bhutan" },
  { code: "971", name: "UAE" },
  { code: "966", name: "Saudi Arabia" },
  { code: "974", name: "Qatar" },
  { code: "965", name: "Kuwait" },
  { code: "968", name: "Oman" },
  { code: "65", name: "Singapore" },
  { code: "60", name: "Malaysia" },
  { code: "44", name: "United Kingdom" },
  { code: "1", name: "USA / Canada" },
  { code: "61", name: "Australia" },
  { code: "64", name: "New Zealand" },
  { code: "27", name: "South Africa" },
  { code: "49", name: "Germany" },
  { code: "33", name: "France" },
];

export const DEFAULT_COUNTRY = "91";

/**
 * Parses a mobile number, email or username. Numbers are stored in international form (+<code><number>):
 * a number typed without "+" or "00" gets the selected country code, and a leading 0 (trunk prefix) is dropped,
 * so "098765 43210" with India selected and "+91 98765 43210" are the same person.
 */
export function parseIdentity(input: string, countryCode: string = DEFAULT_COUNTRY, allowUsername = true): ParsedIdentity {
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter a mobile number, email or username." };

  if (value.includes("@") && !value.startsWith("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? { ok: true, key: value.toLowerCase(), kind: "email" }
      : { ok: false, error: "That email address doesn't look right." };
  }

  const phone = value.replace(/[\s\-().]/g, "");
  if (/^\+?\d+$/.test(phone)) {
    let international: string;
    if (phone.startsWith("+")) international = phone.slice(1);
    else if (phone.startsWith("00")) international = phone.slice(2);
    else international = countryCode + phone.replace(/^0+/, "");
    return /^\d{8,15}$/.test(international)
      ? { ok: true, key: `+${international}`, kind: "phone" }
      : { ok: false, error: "That mobile number looks too short or too long." };
  }

  if (!allowUsername) return { ok: false, error: "Enter a mobile number or email address." };
  const username = value.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_.]{3,30}$/.test(username)
    ? { ok: true, key: `@${username}`, kind: "username" }
    : { ok: false, error: "Usernames use 3–30 letters, numbers, dots or underscores." };
}

export function identityKind(key: string): IdentityKind {
  if (key.startsWith("@")) return "username";
  if (key.includes("@")) return "email";
  return "phone";
}

export const IDENTITY_ICON: Record<IdentityKind, string> = { phone: "📱", email: "✉️", username: "👤" };
