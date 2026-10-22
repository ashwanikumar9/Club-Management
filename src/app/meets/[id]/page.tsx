import { Suspense } from "react";
import { MeetView } from "./MeetView";

export default function MeetPage({ params }: PageProps<"/meets/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <MeetView params={params} />
    </Suspense>
  );
}
