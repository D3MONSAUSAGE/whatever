"use client";
import { useT } from "@/lib/i18n/client";

import { useMemo, useState } from "react";
import { IconImage, IconList, IconTv } from "@/components/icons";
import {
  PICKER_FILTERS,
  filterPickerEntries,
  pickerTypeLabel,
  pictureSelection,
  type PickerCategory,
  type PickerEntry,
} from "@/lib/content-picker";
import type { MessageKey } from "@/lib/i18n";

export function ContentPicker({
  entries,
  busy,
  layoutsUnavailable = false,
  initialQuery = "",
  initialCategory = "all",
  initialSelected = "",
  onPublishPicture,
  onPublish,
}: {
  entries: PickerEntry[];
  busy: boolean;
  layoutsUnavailable?: boolean;
  initialQuery?: string;
  initialCategory?: PickerCategory;
  initialSelected?: string;
  onPublishPicture: (id: string) => void;
  onPublish: (entry: PickerEntry) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<PickerCategory>(initialCategory);
  const [selected, setSelected] = useState(initialSelected);
  const shown = useMemo(() => filterPickerEntries(entries, query, category), [entries, query, category]);
  const chosen = entries.find((entry) => entry.action === "select" && entry.id === selected);
  const searching = query.trim().length > 0;

  return (
    <div className="grid min-w-0 gap-3">
      <label className="text-sm font-semibold">
        {t("cp.search")}
        <input
          className="field mt-1"
          type="search"
          aria-label={t("cp.searchAria")}
          placeholder={t("cp.searchPh")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div role="group" aria-label={t("cp.typeAria")} className="flex flex-wrap gap-2">
        {PICKER_FILTERS.map((filter) => {
          const on = category === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              className={`btn min-h-11 ${on ? "btn-pressed" : "btn-quiet"}`}
              aria-pressed={on}
              onClick={() => setCategory(filter.id)}
            >
              {t(`cp.filter.${filter.id}`)}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t(emptyCopy(category, searching, layoutsUnavailable))}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((entry) => {
            const on = entry.action === "select" && selected === entry.id;
            return (
              <li key={`${entry.category}:${entry.id}`} className="min-w-0">
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={entry.action === "select" ? on : undefined}
                  aria-label={`${entry.fileName}, ${t(`cp.type.${entry.category}`)}`}
                  className={`w-full overflow-hidden rounded-xl border bg-white text-left ${on ? "border-primary ring-2 ring-primary" : "border-line"} hover:border-primary focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                  onClick={() => {
                    if (entry.action === "select") setSelected(pictureSelection(selected, entry.id));
                    else onPublish(entry);
                  }}
                >
                  <span className="block aspect-video bg-ink">
                    {entry.thumbnailUrl ? (
                      <img src={entry.thumbnailUrl} alt="" className="size-full object-contain" />
                    ) : (
                      <TypeMark category={entry.category} />
                    )}
                  </span>
                  <span className="grid gap-1 p-2">
                    <span className="badge w-fit">{t(`cp.type.${entry.category}`)}</span>
                    <span className="truncate text-sm font-semibold">{entry.fileName}</span>
                    {on ? <span className="text-xs font-semibold text-primary">{t("cp.selected")}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={busy || !chosen}
          onClick={() => chosen && onPublishPicture(chosen.id)}
        >
          {t("cp.publish")}
        </button>
        {chosen ? <span className="text-sm text-muted truncate">{t("cp.selectedName", { name: chosen.fileName })}</span> : <span className="text-sm text-muted">{t("cp.hint")}</span>}
      </div>
    </div>
  );
}

function emptyCopy(category: PickerCategory, searching: boolean, layoutsUnavailable: boolean): MessageKey {
  if (searching) return "cp.noMatch";
  if (category === "picture") return "cp.noPictures";
  if (category === "video") return "cp.noVideos";
  if (category === "presentation") return "cp.noPresentations";
  if (category === "playlist") return "cp.noPlaylists";
  if (category === "menu") return "cp.noMenus";
  if (category === "layout") return layoutsUnavailable ? "cp.noLayoutsAccount" : "cp.noLayouts";
  return "cp.nothing";
}

function TypeMark({ category }: { category: PickerEntry["category"] }) {
  const icon = category === "video" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 6.5v11l9-5.5-9-5.5z" /></svg>
  ) : category === "playlist" || category === "menu" ? <IconList /> : category === "layout" ? <IconTv /> : <IconImage />;
  return (
    <span className="grid size-full place-items-center gap-1 bg-[#e7eef8] text-primary">
      <span className="icon-tile size-10">{icon}</span>
      <span className="text-xs font-semibold">{pickerTypeLabel(category)}</span>
    </span>
  );
}
