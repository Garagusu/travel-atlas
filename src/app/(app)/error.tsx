"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl mb-2">This page didn&apos;t load</h1>
      <p className="text-ink-soft mb-6">
        Something went wrong while loading your journal{error.digest ? ` (reference ${error.digest})` : ""}. Your saved data is safe.
        If this keeps happening, check that the database is reachable.
      </p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
