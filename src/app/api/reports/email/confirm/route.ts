import { caller, checkCode, db, json, missingSetup, secret } from "@/lib/reports/server";

/** Checks the code and saves the address for reports. */
export async function POST(request: Request) {
  const setup = missingSetup();
  if (setup) return json({ error: setup }, 503);
  const who = await caller(request);
  if (!who) return json({ error: "Sign in first." }, 401);
  const { token, code } = (await request.json().catch(() => ({}))) as { token?: string; code?: string };
  const checked = checkCode(token ?? "", code ?? "", who.identity);
  if ("error" in checked) return json(checked, 400);
  const { error } = await db(who.token).rpc("set_report_email", { secret, who: who.identity, address: checked.email });
  if (error) return json({ error: error.message }, 500);
  return json({ email: checked.email });
}
