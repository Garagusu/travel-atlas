export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card/60 px-6 py-10 text-center">
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mt-1.5 text-sm text-ink-soft max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
