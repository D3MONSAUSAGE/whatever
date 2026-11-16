"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Fades its children in when they scroll into view. Server HTML is fully visible (no-JS, crawlers);
 * only content that starts below the fold is hidden, and reduced motion skips the effect entirely.
 */
export function Reveal({ children, className = "", as: Tag = "div", delay = 0 }: {
  children: React.ReactNode; className?: string; as?: "div" | "li" | "section" | "article"; delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"static" | "pending" | "in">("static");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.92) return; // already on screen: never hide it
    setState("pending");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setState("in"); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`mk-reveal ${className}`} data-state={state === "static" ? undefined : state}
      style={delay && state === "in" ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
