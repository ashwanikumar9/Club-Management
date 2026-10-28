import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Email } from "./report";

/**
 * Server side of emailed reports (route handlers under /api/reports). Needs, in Vercel's environment:
 * BREVO_API_KEY (sends the emails), REPORT_FROM_EMAIL (a sender verified in Brevo) and CRON_SECRET (the
 * secret the reports SQL created; it also lets Vercel's monthly job call /api/reports/monthly).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const secret = process.env.CRON_SECRET ?? "";

export function missingSetup(): string | null {
  if (!url || !key) return "Reports need the database to be connected.";
  const missing = ["BREVO_API_KEY", "REPORT_FROM_EMAIL", "CRON_SECRET"].filter((k) => !process.env[k]);
  return missing.length ? `Email reports aren't set up yet (missing ${missing.join(", ")} in Vercel). Ask the site owner.` : null;
}

/** A database client acting as the person whose sign-in token is given (or as a visitor). */
export function db(token?: string): SupabaseClient {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

/** The signed-in person behind the request (same key as the database's my_identity()), with their token. */
export async function caller(request: Request): Promise<{ identity: string; token: string } | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  const { email, phone } = data.user;
  const identity = email ? email.toLowerCase() : phone ? `+${phone.replace(/^\+/, "")}` : null;
  return identity ? { identity, token } : null;
}

export async function loadDocs<T>(client: SupabaseClient, collection: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("documents").select("data").eq("collection", collection).range(from, from + 999);
    if (error) throw error;
    out.push(...data.map((r) => r.data as T));
    if (data.length < 1000) return out;
  }
}

export async function sendEmail(to: string, email: Email): Promise<void> {
  const res = await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.REPORT_FROM_EMAIL, name: "Rally Scorer" },
      to: [{ email: to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }),
  });
  if (!res.ok) throw new Error(`The email service refused the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

// A code proves the person can read the address. Nothing is stored until it is confirmed: the token handed
// to the browser carries who / which address / until when, signed together with the code.
const sign = (payload: string, code: string) => createHmac("sha256", secret).update(`${payload}|${code}`).digest("base64url");

export function issueCode(identity: string, email: string): { code: string; token: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const payload = Buffer.from(JSON.stringify({ identity, email, exp: Date.now() + 15 * 60_000 })).toString("base64url");
  return { code, token: `${payload}.${sign(payload, code)}` };
}

export function checkCode(token: string, code: string, identity: string): { email: string } | { error: string } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { error: "Start again: ask for a new code." };
  const expected = Buffer.from(sign(payload, code.trim()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: "That code isn't right." };
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { identity: string; email: string; exp: number };
  if (data.identity !== identity) return { error: "Start again: ask for a new code." };
  if (data.exp < Date.now()) return { error: "The code has expired. Ask for a new one." };
  return { email: data.email };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
