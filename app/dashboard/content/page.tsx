"use client";

import Link from "next/link";
import { IconImage } from "@/components/icons";
import { PageHeader } from "@/components/ui";

const GROUPS = [
  {
    title: "Media",
    lede: "Pictures, video, and files already in the library.",
    links: [{ href: "/dashboard/media", label: "Open the media library" }],
  },
  {
    title: "Menus and layouts",
    lede: "Menu boards, promotions, and Layout Studio. They save into the same library.",
    links: [
      { href: "/dashboard/media/menus", label: "Menus" },
      { href: "/dashboard/media/promos", label: "Promotions" },
      { href: "/dashboard/media/layout-studio", label: "Layout Studio" },
    ],
  },
  {
    title: "Playlists and presentations",
    lede: "Playlists are their own pages. A PowerPoint or PDF is a presentation in the media library.",
    links: [
      { href: "/dashboard/playlists", label: "Playlists" },
      { href: "/dashboard/media", label: "Presentations" },
    ],
  },
];

export default function ContentHub() {
  return (
    <section className="min-w-0">
      <PageHeader title="Content" eyebrow="Library" lede="One library. These open the pages that already hold media, menus, playlists, and presentations." icon={<IconImage />} />
      <ul className="grid gap-3 md:grid-cols-3">
        {GROUPS.map((group) => (
          <li key={group.title} className="card p-4 min-w-0">
            <h2 className="font-semibold">{group.title}</h2>
            <p className="text-sm text-muted mt-1">{group.lede}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.links.map((link) => (
                <Link key={link.label} href={link.href} className="btn min-h-11">{link.label}</Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
