import { Suspense } from "react";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage({ params }: PageProps<"/meets/[id]/register">) {
  return (
    <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
      <RegisterForm params={params} />
    </Suspense>
  );
}
