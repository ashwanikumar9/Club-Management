import { Suspense } from "react";
import { JoinTeam } from "./JoinTeam";

export default function JoinTeamPage({ params }: PageProps<"/teams/[id]/join/[code]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <JoinTeam params={params} />
    </Suspense>
  );
}
