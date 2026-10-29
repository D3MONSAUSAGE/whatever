"use client";
import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Seemple page error", error.digest ?? "", error.message); }, [error]);
  return (
    <ErrorView
      title="Something went wrong"
      body={`This page hit a problem. Your screens keep playing. Try again, and if it keeps happening, tell support${error.digest ? ` the code ${error.digest}` : ""}.`}
      action={<button type="button" className="btn btn-primary" onClick={reset}>Try again</button>}
    />
  );
}
