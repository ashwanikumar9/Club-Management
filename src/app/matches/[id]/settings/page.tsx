import { Suspense } from "react";
import { MatchSettings } from "./MatchSettings";

export default function SettingsPage({ params }: PageProps<"/matches/[id]/settings">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <MatchSettings params={params} />
    </Suspense>
  );
}
