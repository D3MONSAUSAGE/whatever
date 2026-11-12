"use client";

import { IconImage } from "@/components/icons";
import { PageHeader } from "@/components/ui";

const GROUPS = [
  {
    title: "Media",
    lede: "Pictures, video, and files already in the library.",
  },
  {
    title: "Menus and layouts",
    lede: "Menu boards, promotions, and Layout Studio. They save into the same library.",
  },
  {
    title: "Playlists and presentations",
    lede: "Playlists are their own pages. A PowerPoint or PDF is a presentation in the media library.",
  },
];

export function ContentHub({ pathOverride }: { pathOverride?: string }) {
  return (
    <section className="min-w-0" data-preview-path={pathOverride}>

      <PageHeader title="Content" eyebrow="Library" lede="One library. Use the tabs above to open media, menus, promotions, Layout Studio, playlists, and presentations." icon={<IconImage />} />
      <ul className="grid gap-3 md:grid-cols-3">
        {GROUPS.map((group) => (
          <li key={group.title} className="card p-4 min-w-0">
            <h2 className="font-semibold">{group.title}</h2>
            <p className="text-sm text-muted mt-1">{group.lede}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
