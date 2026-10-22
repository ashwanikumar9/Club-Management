import { Suspense } from "react";
import { PublicMatch } from "./PublicMatch";

export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <PublicMatch params={params} />
    </Suspense>
  );
}
