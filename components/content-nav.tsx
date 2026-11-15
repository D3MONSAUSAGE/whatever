"use client";
import { useT } from "@/lib/i18n/client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CONTENT_TABS, activeContentTab, kindFromPath } from "@/lib/content-nav";

export function ContentNav({ pathOverride }: { pathOverride?: string }) {
  return (
    <Suspense fallback={<ContentNavList current={null} />}>
      <ContentNavInner pathOverride={pathOverride} />
    </Suspense>
  );
}

function ContentNavInner({ pathOverride }: { pathOverride?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const path = pathOverride ?? pathname;
  const kind = pathOverride
    ? kindFromPath(pathOverride, pathOverride.includes("kind=presentation") ? "presentation" : null)
    : params.get("kind");
  return <ContentNavList current={activeContentTab(path, kind)} />;
}

function ContentNavList({ current }: { current: string | null }) {
  const t = useT();
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  // Scroll affordance: fade the edge that still has tabs past it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const left = list.scrollLeft > 2;
      const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 2;
      setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { list.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);

  useEffect(() => {
    const node = activeRef.current;
    if (!node) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [current]);

  return (
    <nav aria-label={t("cnav.aria")} className="content-nav">
      <ul ref={listRef} className="content-nav-list" data-more-left={more.left || undefined} data-more-right={more.right || undefined}>
        {CONTENT_TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={tab.href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className="content-nav-link"
              >
                {t(`cnav.tab.${tab.id}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
