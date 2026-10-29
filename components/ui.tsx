"use client";

export function PageHeader({ title, lede, icon, children }: { title: string; lede?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0 flex items-start gap-3">
        {icon ? <span className="icon-tile size-11 rounded-2xl">{icon}</span> : null}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight">{title}</h1>
          {lede ? <div className="text-muted mt-1 text-sm md:text-[15px] max-w-2xl leading-relaxed">{lede}</div> : null}
        </div>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  className = "",
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  tone?: "live" | "danger";
  icon?: React.ReactNode;
}) {
  const valueTone = tone === "live" ? "text-live-ink" : tone === "danger" ? "text-danger" : "";
  const labelTone = tone === "live" ? "text-live-ink" : tone === "danger" ? "text-danger" : "text-muted";
  return (
    <div className={`card px-4 py-4 ${tone === "live" ? "stat-live" : ""} ${tone === "danger" ? "stat-danger" : ""} ${className}`} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>{label}</p>
        {icon ? <span className="icon-tile size-8">{icon}</span> : tone === "live" ? <span className="size-2.5 rounded-full bg-live" aria-hidden /> : tone === "danger" ? <span className="size-2.5 rounded-full bg-danger" aria-hidden /> : null}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
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
