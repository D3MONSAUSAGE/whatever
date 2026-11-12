"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
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
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const node = activeRef.current;
    if (!node) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [current]);

  return (
    <nav aria-label="Content" className="content-nav">
      <ul ref={listRef} className="content-nav-list">
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
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
