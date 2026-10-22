import { Suspense } from "react";
import { TieView } from "./TieView";

export default function TiePage({ params }: PageProps<"/ties/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <TieView params={params} />
    </Suspense>
  );
}
