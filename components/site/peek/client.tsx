"use client";
/**
 * Interactive parts of the Peek marketing site. The page works without them: the first board, every link and every
 * CTA are server-rendered. They add the hero board switcher (swipe + dots on phones, chips on desktop) and the phone
 * menu sheet. Funnel counts reuse lib/funnel-client (cookieless, no personal data).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { trackFunnel } from "@/lib/funnel-client";
import { HERO_SIZES, heroImage, heroSrcSet } from "@/lib/marketing-home";

type Slide = { id: string; label: string; alt: string };

/** Hero: real, pre-rendered Pekko templates. Phones swipe between them (scroll snap + dots); desktop uses chips. */
export function PeekHeroBoards({ slides, chipsLabel, swipeLabel, slideLabel, badge, corner }: { slides: Slide[]; chipsLabel: string; swipeLabel: string; slideLabel: string; badge: string; corner?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const tried = useRef(false);
  const note = useCallback(() => {
    if (tried.current) return;
    tried.current = true;
    trackFunnel("template_try", "hero", { oncePerPage: true });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        setIndex((prev) => (prev === i ? prev : i));
        if (i > 0) note();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [note]);

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    note();
    setIndex(i);
    el.scrollTo({ left: i * el.clientWidth, behavior: "instant" as ScrollBehavior });
  }
  function key(e: React.KeyboardEvent) {
    const n = slides.length;
    const next = e.key === "ArrowRight" ? (index + 1) % n : e.key === "ArrowLeft" ? (index + n - 1) % n : -1;
    if (next < 0) return;
    e.preventDefault();
    go(next);
  }

  return (
    <>
      <div className="pkm-tv">
      <div className="pkm-bezel"><div className="pkm-screen">
      <div className="pkm-slides" ref={track} tabIndex={0} role="group" aria-roledescription="carousel" aria-label={swipeLabel} onKeyDown={key} data-testid="hero-boards">
        {slides.map((s, i) => (
          <img key={s.id} src={heroImage(s.id, 640)} srcSet={heroSrcSet(s.id)} sizes={HERO_SIZES} width={1280} height={720} alt={s.alt}
            loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} decoding="async"
            aria-roledescription="slide" aria-label={slideLabel.replace("{n}", String(i + 1)).replace("{total}", String(slides.length))}
            data-testid={i === index ? "hero-board" : undefined} data-template={s.id} />
        ))}
      </div>
      </div></div>
      <div className="pkm-stand" />
      {corner}
      <span className="pkm-tag">{badge}</span>
      </div>
      <div className="pkm-dots" role="group" aria-label={swipeLabel} data-pkm-dots="">
        {slides.map((s, i) => (
          <button key={s.id} type="button" aria-label={s.label} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} />
        ))}
      </div>
      <div className="pkm-hero-chips">
        <p className="pkm-chips-label" id="pkm-chips-label">{chipsLabel}</p>
        <div className="pkm-chips" role="group" aria-labelledby="pkm-chips-label">
          {slides.map((s, i) => (
            <button key={s.id} type="button" aria-pressed={i === index} data-template={s.id} onClick={() => go(i)}>{s.label}</button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Phone menu: a full-height sheet under the header. Esc and the button close it; the page behind doesn't scroll. */
export function PeekMenu({ openLabel, closeLabel, children }: { openLabel: string; closeLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
      if (e.key === "Tab" && sheet.current) {
        const items = Array.from(sheet.current.querySelectorAll<HTMLElement>("a[href], button"));
        const first = items[0], last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); button.current?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); button.current?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLElement>("a[href]")?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <>
      <button ref={button} type="button" className="pkm-menu-btn" aria-expanded={open} aria-controls="pkm-sheet" aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((v) => !v)} data-testid="pkm-menu-button">
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        )}
      </button>
      <div id="pkm-sheet" className="pkm-sheet" ref={sheet} hidden={!open} onClick={(e) => { if ((e.target as Element).closest("a")) setOpen(false); }} data-testid="pkm-sheet">
        {children}
      </div>
    </>
  );
}
