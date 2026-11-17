"use client";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";

/**
 * Page heading used at the top of every dashboard page (design system, phase 2): the page title in the display
 * face, one line of description, and the page's actions on the right (one primary, any others secondary).
 * It replaces the dark banner header; only Overview keeps a hero. `eyebrow` and `icon` are accepted for older
 * callers and no longer shown, since the sidebar already names the section.
 */
export function PageHeader({ title, lede, action, children, compact }: { title: string; eyebrow?: string; lede?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; compact?: boolean }) {
  return (
    <div className="mb-6" data-testid={compact ? "page-header-compact" : "page-header"}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="ps-h1 break-words">{title}</h1>
          {lede ? <div className="text-muted mt-1.5 text-sm md:text-[15px] max-w-2xl leading-relaxed">{lede}</div> : null}
        </div>
        {action ? <div className="page-header-action flex flex-wrap gap-2 shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
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
  compact,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  tone?: "live" | "danger";
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  const valueTone = tone === "live" ? "text-live-ink" : tone === "danger" ? "text-danger" : "";
  const labelTone = tone === "live" ? "text-live-ink" : tone === "danger" ? "text-danger" : "text-muted";
  return (
    <div className={`card ${compact ? "px-3 py-2" : "px-4 py-4"} ${tone === "live" ? "stat-live" : ""} ${tone === "danger" ? "stat-danger" : ""} ${className}`} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>{label}</p>
        {icon ? <span className="icon-tile size-8">{icon}</span> : tone === "live" ? <span className="size-2.5 rounded-full bg-live" aria-hidden /> : tone === "danger" ? <span className="size-2.5 rounded-full bg-danger" aria-hidden /> : null}
      </div>
      <p className={`${compact ? "mt-0.5 text-lg md:text-xl" : "mt-2 text-2xl"} font-semibold tabular-nums ${valueTone}`}>{value}</p>
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

export function LoadingBlock({ label }: { label?: string }) {
  const t = useT();
  label ??= t("common.loading");
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

export function formatNameList(names: string[], locale?: string) {
  if (names.length <= 1) return names[0] ?? "";
  // I18N-3: Spanish joins with "y" and no serial comma; English output is unchanged.
  if (locale === "es") return new Intl.ListFormat("es", { type: "conjunction" }).format(names);
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** M15: one loading/error pattern for every page. An error is never shown as "loading". */
export function LoadState({ error, label }: { error?: string | null; label?: string }) {
  const t = useT();
  if (!error) return <LoadingBlock label={label} />;
  return (
    <div role="alert" data-testid="load-error" className="card p-4 grid gap-2 border-danger/40">
      <p className="text-danger font-medium">{error}</p>
      <p className="text-sm text-muted">{t("ui.checkConnection")}</p>
      <button type="button" className="btn btn-quiet w-fit" onClick={() => window.location.reload()}>{t("ui.retry")}</button>
    </div>
  );
}

/** M15: warns near an account limit (80%+) and explains what to do once it is reached. */
export function atLimit(count: number | null | undefined, max: number) {
  return count != null && count >= max;
}

export function LimitNote({ count, max, noun, nounKey }: { count: number | null | undefined; max: number; noun: string; nounKey?: MessageKey }) {
  const t = useT();
  if (count == null || count < Math.ceil(max * 0.8)) return null;
  const word = nounKey ? t(nounKey) : noun;
  const full = count >= max;
  return (
    <p role="status" data-testid="limit-note" className={`text-sm rounded-xl px-3 py-2 ${full ? "bg-amber-50 text-amber-900" : "text-muted"}`}>
      {full
        ? t("ui.limitReached", { max, noun: word })
        : t("ui.limitUsed", { count, max, noun: word })}
    </p>
  );
}

/**
 * R12-10: a form field's native validation message in the UI language. English keeps the browser's own
 * messages (no change); Spanish gets "Complete este campo." for an empty required field, plus the email
 * and minimum-length messages. Validation itself is unchanged (same required/type/minLength), and the
 * custom message is cleared on the next input so the browser re-checks the new value.
 */
export function useRequiredMessage() {
  const { t, locale } = useLocale();
  return {
    onInvalid: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      const el = event.currentTarget;
      const minLength = el instanceof HTMLInputElement ? el.minLength : -1;
      const inputType = el instanceof HTMLInputElement ? el.type : undefined;
      const message = validityMessageFor(locale, el.validity, minLength, t, inputType);
      if (message) el.setCustomValidity(message);
    },
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => event.currentTarget.setCustomValidity(""),
  };
}

type ValidityLike = Pick<ValidityState, "valueMissing"> & Partial<Pick<ValidityState, "typeMismatch" | "tooShort">>;
type ValidityKey = "common.required" | "common.invalidEmail" | "common.tooShort";

/** The custom empty-field message, or null to keep the browser's own (English, or a non-empty field). */
export function requiredMessageFor(locale: string, valueMissing: boolean, t: (key: "common.required") => string): string | null {
  return locale === "es" && valueMissing ? t("common.required") : null;
}

/** Spanish message for the first failing native check we cover, or null to keep the browser's own. */
export function validityMessageFor(locale: string, v: ValidityLike, minLength: number, t: (key: ValidityKey, vars?: Record<string, string | number>) => string, inputType?: string): string | null {
  if (locale !== "es") return null;
  if (v.valueMissing) return t("common.required");
  // Only email fields get the email copy; any other typeMismatch keeps the browser's own message.
  if (v.typeMismatch) return inputType === "email" ? t("common.invalidEmail") : null;
  if (v.tooShort && minLength > 0) return t("common.tooShort", { n: minLength });
  return null;
}
