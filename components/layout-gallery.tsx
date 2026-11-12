"use client";

import { layoutThumbnailSrc } from "@/lib/layout-thumbnails";
import { layoutUsesPromoArea, PROMO_AREA_HINT, type LayoutOption } from "@/lib/menu-board-unify";

export function LayoutGallery({
  options,
  selectedId,
  onSelect,
  onContinue,
  onCancel,
}: {
  options: LayoutOption[];
  selectedId: string | null;
  onSelect: (option: LayoutOption) => void;
  onContinue: (option: LayoutOption) => void;
  onCancel: () => void;
}) {
  const selected = options.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="card p-4 md:p-6 mb-6" data-testid="layout-picker">
      <h2 className="text-lg font-semibold">Choose a layout</h2>
      <p className="text-sm text-muted mt-1">
        Your existing boards keep the layout they already have. Select a layout for a new board, then Continue to start editing.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-4" aria-label="Menu board layouts">
        {options.map((option) => {
          const pressed = selectedId === option.id;
          return (
            <li key={option.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={pressed}
                data-testid={`layout-option-${option.id}`}
                className={`w-full h-full rounded-xl border p-3 text-left min-h-11 ${
                  pressed
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-line hover:border-primary"
                }`}
                onClick={() => onSelect(option)}
                onDoubleClick={() => onContinue(option)}
              >
                <div className="aspect-video rounded-lg overflow-hidden bg-ink/5 mb-3" aria-hidden>
                  <img src={layoutThumbnailSrc(option.id)} alt="" className="w-full h-full object-contain" />
                </div>
                <span className="font-medium block">{option.name}</span>
                <span className="text-sm text-muted block mt-1">{option.blurb}</span>
                {layoutUsesPromoArea(option.id) ? (
                  <span className="text-sm text-muted block mt-1">{PROMO_AREA_HINT}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 pt-3 flex flex-wrap gap-2 border-t border-line">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={!selected}
          data-testid="layout-continue"
          onClick={() => { if (selected) onContinue(selected); }}
        >
          Continue
        </button>
        <button type="button" className="btn btn-quiet min-h-11" onClick={onCancel}>Cancel</button>
        <p className="text-sm text-muted self-center">
          {selected ? `Next: edit “${selected.name}”.` : "Select a layout to continue."}
        </p>
      </div>
    </div>
  );
}
