import { Suspense } from "react";
import { TeamView } from "./TeamView";

export default function TeamPage({ params }: PageProps<"/teams/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <TeamView params={params} />
    </Suspense>
  );
}
