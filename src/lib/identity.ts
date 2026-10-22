/**
 * People are identified by a mobile number, email address or in-app username. Each is normalised to a
 * single key so the same person always matches: "+919876543210", "riya@example.com" or "@riya".
 */
export type IdentityKind = "phone" | "email" | "username";

export type ParsedIdentity = { ok: true; key: string; kind: IdentityKind } | { ok: false; error: string };

export function parseIdentity(input: string): ParsedIdentity {
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter a mobile number, email or username." };

  if (value.includes("@") && !value.startsWith("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? { ok: true, key: value.toLowerCase(), kind: "email" }
      : { ok: false, error: "That email address doesn't look right." };
  }

  const phone = value.replace(/[\s\-().]/g, "");
  if (/^\+?\d+$/.test(phone)) {
    return /^\+?\d{7,15}$/.test(phone)
      ? { ok: true, key: phone, kind: "phone" }
      : { ok: false, error: "A mobile number needs 7 to 15 digits." };
  }

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
