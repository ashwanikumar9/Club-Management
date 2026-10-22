import { Suspense } from "react";
import { ScorerScreen } from "./ScorerScreen";

export default function ScorePage({ params }: PageProps<"/matches/[id]/score">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <ScorerScreen params={params} />
    </Suspense>
  );
}
