"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CONTENT_TABS, activeContentTab } from "@/lib/content-nav";

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
    ? (pathOverride.includes("kind=presentation") ? "presentation" : null)
    : params.get("kind");
  return <ContentNavList current={activeContentTab(path, kind)} />;
}

function ContentNavList({ current }: { current: string | null }) {
  return (
    <nav aria-label="Content" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {CONTENT_TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`btn min-h-11 ${active ? "btn-primary" : "btn-quiet"}`}
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
