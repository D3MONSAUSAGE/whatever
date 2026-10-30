"use client";
import { LogoMark, WaveBackdrop } from "@/components/brand";

/**
 * Brand hero used at the top of every dashboard page: dark ink panel with the
 * blue wave, an eyebrow, the page title (h1), a short lede, and the S mark.
 * Actions sit below the panel so buttons keep their normal colours.
 */
export function PageHeader({ title, eyebrow, lede, icon, children }: { title: string; eyebrow?: string; lede?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="banner-dark hero-gradient px-5 py-6 md:px-8 md:py-7">
        <WaveBackdrop tone="dark" className="h-[85%]" />
        <div className="relative flex items-center justify-between gap-5">
          <div className="min-w-0 flex items-start gap-3">
            {icon ? <span className="icon-tile icon-tile-hero size-11 rounded-2xl">{icon}</span> : null}
            <div className="min-w-0">
              {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{eyebrow}</p> : null}
              <h1 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight break-words">{title}</h1>
              {lede ? <div className="text-white/85 mt-1.5 text-sm md:text-[15px] max-w-2xl leading-relaxed">{lede}</div> : null}
            </div>
          </div>
          <LogoMark className="hidden sm:block size-14 md:size-16 shrink-0" />
        </div>
      </div>
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
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
    <div className="grid gap-3" role="status" aria-live="polite" aria-busy="true" data-testid="loading">
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

/** M15: one loading/error pattern for every page. An error is never shown as "loading". */
export function LoadState({ error, label = "Loading…" }: { error?: string | null; label?: string }) {
  if (!error) return <LoadingBlock label={label} />;
  return (
    <div role="alert" data-testid="load-error" className="card p-4 grid gap-2 border-danger/40">
      <p className="text-danger font-medium">{error}</p>
      <p className="text-sm text-muted">Check your connection, then try again.</p>
      <button type="button" className="btn btn-quiet w-fit" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}

/** M15: warns near an account limit (80%+) and explains what to do once it is reached. */
export function atLimit(count: number | null | undefined, max: number) {
  return count != null && count >= max;
}

export function LimitNote({ count, max, noun }: { count: number | null | undefined; max: number; noun: string }) {
  if (count == null || count < Math.ceil(max * 0.8)) return null;
  const full = count >= max;
  return (
    <p role="status" data-testid="limit-note" className={`text-sm rounded-xl px-3 py-2 ${full ? "bg-amber-50 text-amber-900" : "text-muted"}`}>
      {full
        ? `You've reached the limit of ${max} ${noun}. Delete one to add another.`
        : `${count} of ${max} ${noun} used.`}
    </p>
  );
}
