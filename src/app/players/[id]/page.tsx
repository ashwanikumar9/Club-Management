import { Suspense } from "react";
import { PlayerProfile } from "./PlayerProfile";

export default function PlayerPage({ params }: PageProps<"/players/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <PlayerProfile params={params} />
    </Suspense>
  );
}
