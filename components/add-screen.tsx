"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi, type DisplayItem } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/toast";
import { IconTv } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { PairForm, pairingSettled, type PairWatch } from "@/components/displays-screen";

const PAIR_WATCH_MS = 3_000;
const PAIR_WATCH_FOR_MS = 2 * 60_000;
/** Static QR for the canonical TV address (same URL Android +14 encodes from /api/config tvUrl). */
export const TV_QR_SRC = "/qr/tv.svg";

/**
 * Parity Phase 1 (t353u, W1): Add screen is a focused pairing page: the form, one TV address with a
 * copy button and a QR, and the just-paired screen. It no longer repeats the whole screen list; screens
 * are managed on My Screens. Pairing still uses POST /api/displays/pair, unchanged.
 */
export function AddScreen({ fixture }: { fixture?: DisplayItem[] }) {
  const t = useT();
  const toast = useToast();
  const live = useApi<DisplayItem[]>(fixture ? null : "/api/displays", fixture ? undefined : 10_000);
  const displays = fixture ? { data: fixture, error: null as string | null, reload: async () => {} } : live;
  const [watchUntil, setWatchUntil] = useState(0);
  const [watch, setWatch] = useState<PairWatch>({ id: null, before: [] });
  const beforePair = useRef<string[]>([]);
  const reload = displays.reload;
  const settled = pairingSettled(displays.data, watch);
  useEffect(() => {
    if (!watchUntil || fixture) return;
    if (settled) { setWatchUntil(0); return; }
    const timer = setInterval(() => {
      if (Date.now() > watchUntil) { setWatchUntil(0); return; }
      reload();
    }, PAIR_WATCH_MS);
    return () => clearInterval(timer);
  }, [watchUntil, settled, reload, fixture]);

  const paired = watch.id ? (displays.data ?? []).find((display) => display.id === watch.id) ?? null : null;
  return (
    <section className="min-w-0 max-w-3xl">
      <PageHeader compact title={t("screens.add")} icon={<IconTv />} lede={t("addsc.lede")}
        action={<Link href="/dashboard/screens" className="btn btn-quiet min-h-11">{t("screens.all")}</Link>}
      />
      {paired ? (
        <div role="status" className="card p-4 mb-4" data-testid="paired-screen">
          <h2 className="font-semibold">{paired.name}</h2>
          <p className="text-sm mt-1">{settled ? t("addsc.pairedOnline") : t("disp.connecting")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/dashboard/screens/${paired.id}?panel=change`} className="btn btn-primary min-h-11">{t("sa.change")}</Link>
            <Link href={`/dashboard/screens/${paired.id}`} className="btn btn-quiet min-h-11">{t("addsc.openScreen")}</Link>
          </div>
        </div>
      ) : watchUntil ? (
        <p role="status" className="card p-3 mb-3 text-sm" data-testid="pair-watch">{t("disp.connecting")}</p>
      ) : null}
      <PairForm names={(displays.data ?? []).map((display) => display.name)}
        address={<TvAddress />}
        onPaired={(warning, id) => {
          toast.show(warning || t("disp.connected"));
          setWatch({ id: id ?? null, before: beforePair.current });
          void displays.reload();
          setWatchUntil(Date.now() + PAIR_WATCH_FOR_MS);
        }}
        onSubmitting={() => { beforePair.current = (displays.data ?? []).map((display) => display.id); }}
        onError={(message) => toast.show(message, true)} />
      {toast.node}
    </section>
  );
}

/** One address (/tv), a copy button and a QR. /pair opens the same player, so it isn't repeated. */
export function TvAddress() {
  const t = useT();
  const [url, setUrl] = useState("/tv");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(`${window.location.origin}/tv`); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <span className="mt-2 flex flex-wrap items-center gap-3">
      <span className="flex flex-wrap items-center gap-2">
        <code data-testid="tv-url" className="rounded-lg border border-line bg-white px-3 py-2 text-base font-semibold text-ink break-all">{url}</code>
        <button type="button" className="btn" onClick={copy} aria-label={t("disp.copyAddress")}>{copied ? t("disp.copied") : t("disp.copy")}</button>
        <span role="status" className="sr-only">{copied ? t("disp.addressCopied") : ""}</span>
      </span>
      <span className="flex items-center gap-2 text-xs text-muted">
        <img src={TV_QR_SRC} alt={t("addsc.qrAlt")} width={88} height={88} className="size-[88px] rounded-md border border-line bg-white p-1" data-testid="tv-qr" />
        <span className="max-w-[12rem]">{t("addsc.qrHelp")}</span>
      </span>
    </span>
  );
}
