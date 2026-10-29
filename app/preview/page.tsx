import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PreviewApp } from "./preview-app";

export const dynamic = "force-dynamic";

/** Screenshot harness. 404 unless PANTALLA_UI_PREVIEW=1. Not linked from the app. */
export default function PreviewPage() {
  if (process.env.PANTALLA_UI_PREVIEW !== "1") notFound();
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
      <PreviewApp />
    </Suspense>
  );
}
