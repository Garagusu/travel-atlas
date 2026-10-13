import { Link } from "@/lib/nav";

export function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl mb-2">Nothing on the map here</h1>
      <p className="text-ink-soft mb-6">This page doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="btn btn-primary">Back to the map</Link>
    </div>
  );
}
