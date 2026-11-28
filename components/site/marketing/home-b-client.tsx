"use client";
/**
 * Interactive parts of the home page (Option B). Everything works without them (the hero image, links and
 * the first how-it-works step are server-rendered); they add the template switcher, the live demo, the step
 * tabs, the phone sticky CTA and the funnel counts (lib/funnel-client.ts, cookieless, no personal data).
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { trackFunnel } from "@/lib/funnel-client";
import type { CtaLocation } from "@/lib/funnel";
import { HERO_SIZES, heroImage, heroSrcSet } from "@/lib/marketing-home";

/** A trial CTA that counts one cta_click (with its position) and then navigates as a normal link. */
export function TrialLink({ href, location, className, children, tabIndex, testId }: { href: string; location: CtaLocation; className?: string; children: ReactNode; tabIndex?: number; testId?: string }) {
  return (
    <Link href={href} className={className} tabIndex={tabIndex} data-testid={testId} data-cta={location} onClick={() => trackFunnel("cta_click", location)}>
      {children}
    </Link>
  );
}

/** Counts a cta_click for any trial link inside (used around server-rendered pricing cards). */
export function TrackSignupClicks({ location, children }: { location: CtaLocation; children: ReactNode }) {
  return (
    <div onClickCapture={(e) => { if ((e.target as Element).closest?.('a[href="/signup"], a[href="/create"]')) trackFunnel("cta_click", location); }}>
      {children}
    </div>
  );
}

type Chip = { id: string; label: string; name: string };

/** Hero: swaps between pre-rendered real templates (instant; no renderer in the first screen). */
export function HeroSwitcher({ chips, chipsLabel, altFor, badge }: { chips: Chip[]; chipsLabel: string; altFor: Record<string, string>; badge: string }) {
  const [current, setCurrent] = useState(chips[0].id);
  const [shown, setShown] = useState(chips[0].id);
  const name = chips.find((c) => c.id === current)?.name ?? "";
  function pick(id: string) {
    setCurrent(id);
    trackFunnel("template_try", "hero", { oncePerPage: true });
    // Show the new board once it has loaded, so the TV never flashes empty.
    const pre = new Image();
    pre.onload = () => setShown(id);
    pre.onerror = () => setShown(id);
    pre.src = heroImage(id, window.innerWidth > 979 || window.devicePixelRatio > 1.5 ? 1280 : 640);
  }
  return (
    <div className="hb-visual">
      <div className="hb-tv">
        <img key={shown} src={heroImage(shown, 640)} srcSet={heroSrcSet(shown)} sizes={HERO_SIZES} width={1280} height={720}
          alt={altFor[shown]} fetchPriority={shown === chips[0].id ? "high" : "auto"} decoding="async" data-testid="hero-board" data-template={shown} />
        <span className="hb-badge">{badge}</span>
      </div>
      <div className="hb-chips" role="group" aria-label={chipsLabel}>
        {chips.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === current} onClick={() => pick(c.id)} data-template={c.id}>{c.label}</button>
        ))}
      </div>
      <p className="hb-tpl-name" aria-live="polite" data-testid="hero-template-name">{name}</p>
    </div>
  );
}

type DemoText = { name: string; item: string; price: string; chipsLabel: string; note: string; loading: string; failed: string; preview: string };
type Renderer = {
  render: (id: string, input: { title: string; itemName: string; itemPrice: string }) => string;
  defaults: (id: string) => { title: string; itemName: string; itemPrice: string };
};

/** Loads Pekko's real browser-side renderer (the same designSvg the menu designer uses) and app fonts on demand. */
async function loadRenderer(): Promise<Renderer> {
  const [{ designSvg }, designs, { fontFaceCss }] = await Promise.all([import("@/lib/menu-design-svg"), import("@/lib/menu-designs"), import("@/lib/board-fonts")]);
  if (!document.getElementById("hb-board-fonts")) {
    const style = document.createElement("style");
    style.id = "hb-board-fonts";
    style.textContent = fontFaceCss();
    document.head.appendChild(style);
  }
  const doc = (id: string, input?: { title: string; itemName: string; itemPrice: string }) => {
    const design = designs.designById(id);
    if (!design) throw new Error(`Unknown template ${id}`);
    const d = designs.designDocument(design);
    const sections = d.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));
    const first = sections[0]?.items[0];
    if (input?.title.trim()) d.title = input.title.trim().slice(0, 40);
    if (first && input?.itemName.trim()) first.name = input.itemName.trim().slice(0, 40);
    if (first && input?.itemPrice.trim()) first.price = input.itemPrice.trim().slice(0, 12);
    return { ...d, sections };
  };
  const stockHrefs = (d: ReturnType<typeof doc>) => {
    const out: Record<string, string> = {};
    if (d.stockPhoto) out[d.stockPhoto] = designs.stockPhotoPath(d.stockPhoto);
    for (const s of d.sections) for (const i of s.items) if (i.stockPhoto) out[i.stockPhoto] = designs.stockPhotoPath(i.stockPhoto);
    return out;
  };
  return {
    render(id, input) {
      const d = doc(id, input);
      const hrefs = stockHrefs(d);
      return designSvg(d, { stockHref: d.stockPhoto ? hrefs[d.stockPhoto] ?? null : null, stockHrefs: hrefs });
    },
    defaults(id) {
      const d = doc(id);
      const first = d.sections[0]?.items[0];
      return { title: d.title, itemName: first?.name ?? "", itemPrice: first?.price ?? "" };
    },
  };
}

/** "Type your menu. See it on screen.": the live template demo. Loads only when the section is near. */
/**
 * `ns` is the class-name prefix ("hb" for the Option B home, "pkm" for the Peek marketing site) so each site styles the
 * same demo with its own stylesheet; `initial` is the template shown first (defaults to the first chip).
 */
export function LiveDemo({ chips, text, children, ns = "hb", initial }: { chips: Chip[]; text: DemoText; children?: ReactNode; ns?: string; initial?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(initial && chips.some((c) => c.id === initial) ? initial : chips[0].id);
  const [input, setInput] = useState({ title: "", itemName: "", itemPrice: "" });
  const [svg, setSvg] = useState("");
  const [fontsTick, setFontsTick] = useState(0);
  const used = useRef(false);
  const booted = useRef<(() => void) | null>(null);
  // The guest-editor link reads what the visitor typed, so the editor opens on the same menu.
  useEffect(() => { demoState = { id: current, input }; }, [current, input]);

  // Performance: the renderer and board fonts load only once the demo is on screen and the browser is idle, or as
  // soon as the visitor touches the form. Until then the same template is shown as its pre-rendered image.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let cancelled = false;
    let started = false;
    const boot = () => {
      if (started) return;
      started = true;
      loadRenderer().then((r) => {
        if (cancelled) return;
        setRenderer(r);
        // Redraw once the board fonts are ready so text measures and looks exactly as on the TV.
        document.fonts?.ready.then(() => !cancelled && setFontsTick((n) => n + 1)).catch(() => undefined);
      }).catch(() => !cancelled && setFailed(true));
    };
    booted.current = boot;
    const idle = (fn: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 2000 });
      else setTimeout(fn, 300);
    };
    if (!("IntersectionObserver" in window)) { idle(boot); return () => { cancelled = true; }; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); idle(boot); } }, { threshold: 0.25 });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const id = requestAnimationFrame(() => {
      try { setSvg(renderer.render(current, input)); } catch { setFailed(true); }
    });
    return () => cancelAnimationFrame(id);
  }, [renderer, current, input, fontsTick]);

  const placeholder = renderer ? renderer.defaults(current) : { title: "", itemName: "", itemPrice: "" };
  const name = chips.find((c) => c.id === current)?.name ?? "";
  const touch = () => { booted.current?.(); if (!used.current) { used.current = true; trackFunnel("template_try", "demo", { oncePerPage: true }); } };
  const set = (k: keyof typeof input) => (e: React.ChangeEvent<HTMLInputElement>) => { touch(); setInput((v) => ({ ...v, [k]: e.target.value })); };

  return (
    <div className={`${ns}-demo`} ref={root} data-testid="live-demo">
      <form className={`${ns}-demo-form`} autoComplete="off" aria-describedby="hb-demo-note" onSubmit={(e) => e.preventDefault()} onFocusCapture={() => booted.current?.()} onPointerDownCapture={() => booted.current?.()}>
        <label htmlFor="hb-d-title">{text.name}<input id="hb-d-title" maxLength={28} placeholder={placeholder.title} value={input.title} onChange={set("title")} /></label>
        <div className={`${ns}-demo-row`}>
          <label htmlFor="hb-d-item">{text.item}<input id="hb-d-item" maxLength={26} placeholder={placeholder.itemName} value={input.itemName} onChange={set("itemName")} /></label>
          <label htmlFor="hb-d-price">{text.price}<input id="hb-d-price" maxLength={7} inputMode="decimal" placeholder={placeholder.itemPrice} value={input.itemPrice} onChange={set("itemPrice")} /></label>
        </div>
        <div className={`${ns}-chips ${ns}-chips-tight`} role="group" aria-label={text.chipsLabel}>
          {chips.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === current} data-template={c.id} onClick={() => { touch(); setCurrent(c.id); }}>{c.label}</button>
          ))}
        </div>
        <p className={`${ns}-demo-note`} id="hb-demo-note">{text.note}</p>
      </form>
      <div>
        <div className={`${ns}-tv`}>
          {svg && !failed ? (
            <div className={`${ns}-svg`} role="img" aria-label={text.preview.replace("{name}", name)} data-testid="demo-board" data-template={current} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className={`${ns}-svg ${ns}-svg-wait`} data-testid="demo-board-status">
              {/* The same template, pre-rendered, while the live renderer loads (or if it can't). */}
              <img src={heroImage(current, 640)} srcSet={heroSrcSet(current)} sizes={HERO_SIZES} width={1280} height={720} alt="" loading="lazy" decoding="async" />
              <span role="status" className={failed ? `${ns}-svg-msg` : "sr-only"}>{failed ? text.failed : text.loading}</span>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

type Step = { id: string; label: string; panel: ReactNode };

/** How it works: accessible tabs (arrow keys, Home/End), one step visible at a time. */
export function HowTabs({ steps, label }: { steps: Step[]; label: string }) {
  const [sel, setSel] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function key(e: React.KeyboardEvent, i: number) {
    const n = steps.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setSel(next);
    tabs.current[next]?.focus();
  }
  return (
    <>
      <div className="hb-tabs" role="tablist" aria-label={label}>
        {steps.map((s, i) => (
          <button key={s.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`hb-tab-${s.id}`} aria-controls={`hb-panel-${s.id}`}
            aria-selected={i === sel} tabIndex={i === sel ? 0 : -1} onClick={() => setSel(i)} onKeyDown={(e) => key(e, i)}>
            <span>{i + 1}</span>{s.label}
          </button>
        ))}
      </div>
      {steps.map((s, i) => (
        <div key={s.id} className="hb-panel" role="tabpanel" id={`hb-panel-${s.id}`} aria-labelledby={`hb-tab-${s.id}`} hidden={i !== sel} tabIndex={0}>
          {s.panel}
        </div>
      ))}
    </>
  );
}

/** Phone-only sticky CTA, shown once the hero CTA has scrolled away. */
/** `ns` and `btnClass` let the Peek marketing site restyle it; the defaults are the Option B home. */
export function StickyCta({ href, label, days, card, watch, ns = "hb", btnClass = "btn btn-primary hb-btn-sm" }: { href: string; label: string; days: string; card: string; watch: string; ns?: string; btnClass?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting));
    io.observe(target);
    return () => io.disconnect();
  }, [watch]);
  return (
    <div className={`${ns}-sticky ${on ? "is-on" : ""}`} aria-hidden={!on} data-testid="sticky-cta">
      <span><b>{days}</b><br />{card}</span>
      <TrialLink href={href} location="sticky" className={btnClass} tabIndex={on ? 0 : -1}>{label}</TrialLink>
    </div>
  );
}

/** The demo's latest design and text, for GuestDemoLink. Module state: one demo per page. */
let demoState: { id: string; input: { title: string; itemName: string; itemPrice: string } } | null = null;

/**
 * "Make this menu for free" with the guest editor on (GUEST_EDITOR): saves the demo's menu (design + what the visitor
 * typed, exactly as the demo draws it) as the browser's guest draft and opens the real editor on it. Nothing goes in
 * the URL. If anything fails, it still opens the editor on the same design.
 */
export function GuestDemoLink({ className, children, names }: { className?: string; children: ReactNode; names: Record<string, string> }) {
  return (
    <a href="/create" className={className} data-cta="demo" data-testid="demo-cta" onClick={(e) => {
      e.preventDefault();
      trackFunnel("cta_click", "demo");
      const state = demoState;
      const fallback = `/create${state ? `?design=${encodeURIComponent(state.id)}` : ""}`;
      if (!state) { location.assign(fallback); return; }
      void (async () => {
        try {
          const [designs, guest] = await Promise.all([import("@/lib/menu-designs"), import("@/lib/guest-draft")]);
          const design = designs.designById(state.id);
          if (!design) throw new Error("design");
          const d = designs.designDocument(design);
          const sections = d.sections.map((sec) => ({ ...sec, items: sec.items.map((i) => ({ ...i })) }));
          const first = sections[0]?.items[0];
          if (state.input.title.trim()) d.title = state.input.title.trim().slice(0, 40);
          if (first && state.input.itemName.trim()) first.name = state.input.itemName.trim().slice(0, 40);
          if (first && state.input.itemPrice.trim()) first.price = state.input.itemPrice.trim().slice(0, 12);
          await guest.startGuestDraft({ ...d, sections }, state.input.title.trim().slice(0, 80) || (names[state.id] ?? design.name.en), "demo");
          location.assign("/create?from=demo");
        } catch {
          location.assign(fallback);
        }
      })();
    }}>{children}</a>
  );
}
