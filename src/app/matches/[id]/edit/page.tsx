import { Suspense } from "react";
import { ClosedMatchEditor } from "./ClosedMatchEditor";

export default function EditPage({ params }: PageProps<"/matches/[id]/edit">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <ClosedMatchEditor params={params} />
    </Suspense>
  );
}
