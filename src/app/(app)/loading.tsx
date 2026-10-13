export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center py-24" role="status" aria-label="Loading">
      <div className="h-6 w-6 rounded-full border-2 border-line-strong border-t-pine animate-spin" />
    </div>
  );
}
