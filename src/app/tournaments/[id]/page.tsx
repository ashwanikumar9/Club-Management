import { Suspense } from "react";
import { TournamentView } from "./TournamentView";

export default function TournamentPage({ params }: PageProps<"/tournaments/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <TournamentView params={params} />
    </Suspense>
  );
}
