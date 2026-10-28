import { caller, issueCode, json, missingSetup, sendEmail } from "@/lib/reports/server";

/** Emails a 6-digit code to the address the signed-in person wants their reports sent to. */
export async function POST(request: Request) {
  const setup = missingSetup();
  if (setup) return json({ error: setup }, 503);
  const who = await caller(request);
  if (!who) return json({ error: "Sign in first." }, 401);
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  const address = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return json({ error: "Enter a valid email address." }, 400);
  const { code, token } = issueCode(who.identity, address);
  try {
    await sendEmail(address, {
      subject: `${code} is your Rally Scorer code`,
      html: `<p>Your code to receive Rally Scorer reports at this address is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works for 15 minutes. If you didn't ask for it, ignore this email.</p>`,
      text: `Your code to receive Rally Scorer reports at this address: ${code} (works for 15 minutes).`,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
  return json({ token });
}
