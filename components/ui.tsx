"use client";

export function PageHeader({ title, lede, children }: { title: string; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight">{title}</h1>
        {lede ? <div className="text-muted mt-1 text-sm md:text-[15px] max-w-2xl leading-relaxed">{lede}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, className = "" }: { label: string; value: string | number; hint?: string; className?: string }) {
  return (
    <div className={`card px-4 py-3 ${className}`} title={hint}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-muted text-sm mt-1 max-w-md mx-auto leading-relaxed">{children}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid gap-3" aria-busy="true">
      <p className="text-muted">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
    </div>
  );
}

export function formatNameList(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
