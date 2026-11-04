"use client";
import { useEffect } from "react";

// Plain words only: the raw error (database text, codes) goes to the console, not the page.
export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="card p-10 max-w-lg mx-auto mt-10 text-center space-y-3">
      <div className="card-title">This page didn&apos;t load</div>
      <p className="text-sm text-muted">Something went wrong loading it. Your data is safe.</p>
      <button onClick={reset} className="btn-primary">Try again</button>
    </div>
  );
}
