"use client";

/**
 * Step 4 (Look) Guided Customization: Basic (overall text size, featured photo size) and a collapsed Advanced section
 * (per-role size and weight, section heading overrides, spacing, Fill/Fit and focus, individual resets).
 * Every control edits the shared `custom` contract (lib/board-custom.ts); reset = deleting the key.
 */
import { useLocale } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/en";
import {
  applyCustomReset, customizationSpec, effectiveMediaSize, fontWeightChoices, normalizeCustomFor, ROLE_SCALE, SPACING_SCALE, TEXT_SIZE_PRESETS,
  type FontWeightChoice, type LayoutCustom, type RoleKey, type RoleTypography, type TextSizePreset,
} from "@/lib/board-custom";
import type { LayoutDocument } from "@/lib/layout-studio";
import { orientationOf } from "@/lib/board-orientation";

export type HeadingScope = "all" | number;

const PRESETS = Object.keys(TEXT_SIZE_PRESETS) as TextSizePreset[];
const pct = (v: number) => Math.round(v * 100);

/** Returns the document with `custom` changed by `fn` (empty groups removed, clamped and synced for the template). */
export function withCustom(doc: LayoutDocument, fn: (c: LayoutCustom) => void): LayoutDocument {
  const c: LayoutCustom = doc.custom && doc.custom.v === 1 ? JSON.parse(JSON.stringify(doc.custom)) : { v: 1 };
  fn(c);
  if (c.roles) {
    for (const key of Object.keys(c.roles) as RoleKey[]) {
      const r = c.roles[key];
      if (!r || (r.scale == null && r.weight == null)) delete c.roles[key];
    }
    if (!Object.keys(c.roles).length) delete c.roles;
  }
  if (c.spacing && c.spacing.itemGap == null && c.spacing.sectionGap == null) delete c.spacing;
  const next: LayoutDocument = { ...doc, custom: c };
  if (!Object.keys(c).filter((k) => k !== "v").length) delete next.custom;
  return normalizeCustomFor(next);
}

function roleFont(doc: LayoutDocument, role: RoleKey) {
  return role === "businessName" || role === "featuredText" || role === "sectionHeading" ? doc.font : doc.bodyFont ?? doc.font;
}

type RoleRowProps = { choices: FontWeightChoice[]; value: RoleTypography | undefined; onScale: (v: number) => void; onWeight: (w: FontWeightChoice | undefined) => void; onReset: () => void; testid: string; label: string };
function RoleRow({ choices, value, onScale, onWeight, onReset, testid, label }: RoleRowProps) {
  const { t } = useLocale();
  return (
      <div className="grid gap-1 p-2 rounded-xl border border-line" data-testid={testid}>
        <div className="flex items-center justify-between gap-2">
          <span className="form-label">{label}</span>
          {value ? <button type="button" className="btn btn-quiet min-h-8 text-xs" onClick={onReset} data-testid={`${testid}-reset`}>{t("cz.reset")}</button> : null}
        </div>
        <label className="text-sm grid gap-1">{t("cz.size", { n: pct(value?.scale ?? 1) })}
          <input type="range" min={ROLE_SCALE.min} max={ROLE_SCALE.max} step={0.05} value={value?.scale ?? 1} data-testid={`${testid}-size`}
            onChange={(e) => onScale(Number(e.target.value))} />
        </label>
        <label className="text-sm grid gap-1">{t("cz.weight")}
          <select className="field" value={value?.weight ?? ""} data-testid={`${testid}-weight`} onChange={(e) => onWeight((e.target.value || undefined) as FontWeightChoice | undefined)}>
            <option value="">{t("cz.weightDefault")}</option>
            {choices.map((w) => <option key={w} value={w}>{t(`cz.weight.${w}` as MessageKey)}</option>)}
          </select>
        </label>
      </div>
  );
}

export function CustomizeLook({ doc, update, hasPhoto, open, onOpen, scope, onScope }: {
  doc: LayoutDocument;
  update: (next: LayoutDocument) => void;
  /** A featured photo (owner's or sample) is drawn, so Fill/Fit and focus apply. */
  hasPhoto: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  scope: HeadingScope;
  onScope: (scope: HeadingScope) => void;
}) {
  const { t } = useLocale();
  const spec = customizationSpec(doc);
  const custom = doc.custom && doc.custom.v === 1 ? doc.custom : null;
  const textScale = custom?.textScale ?? 1;
  const media = spec.media ? effectiveMediaSize(doc) ?? spec.media.def : null;
  const reset = (...paths: string[]) => update(applyCustomReset(doc, paths));
  const setRole = (role: RoleKey, patch: Partial<RoleTypography>) => update(withCustom(doc, (c) => {
    c.roles = c.roles ?? {};
    const next = { ...(c.roles[role] ?? {}), ...patch };
    for (const k of Object.keys(next) as (keyof RoleTypography)[]) if (next[k] == null) delete next[k];
    c.roles[role] = next;
  }));
  const named = doc.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.name.trim() || s.items.length);
  const target = typeof scope === "number" && doc.sections[scope] ? scope : null;
  const setOverride = (patch: Partial<RoleTypography>) => {
    if (target == null) return;
    const sections = doc.sections.map((s, i) => {
      if (i !== target) return s;
      const next = { ...(s.headingOverride ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof RoleTypography)[]) if (next[k] == null) delete next[k];
      const { headingOverride: _old, ...rest } = s;
      void _old;
      return Object.keys(next).length ? { ...rest, headingOverride: next } : rest;
    });
    update({ ...doc, sections });
  };
  const hasAny = Boolean(custom) || doc.sections.some((s) => s.headingOverride);
  const roles = spec.roles.filter((r) => r !== "sectionHeading");

  return (
    <div className="grid gap-3" data-testid="tpl-cz">
      <div className="grid gap-1">
        <p className="form-label">{t("cz.title")}</p>
        <p className="text-xs text-muted">{t("cz.note")}</p>
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold" id="tpl-cz-text-label">{t("cz.textSize")}</p>
        <div className="seg grid grid-cols-4" role="group" aria-labelledby="tpl-cz-text-label">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="!px-1 !whitespace-normal leading-tight" aria-pressed={Math.abs(TEXT_SIZE_PRESETS[p] - textScale) < 0.005} data-testid={`tpl-cz-text-${p}`}
              onClick={() => (p === "default" ? reset("custom.textScale") : update(withCustom(doc, (c) => { c.textScale = TEXT_SIZE_PRESETS[p]; })))}>
              {t(`cz.preset.${p}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      {spec.media && media != null ? (
        <div className="grid gap-1">
          <label className="text-sm font-semibold grid gap-1">
            <span className="flex justify-between gap-2"><span>{spec.media.axis === "height" || orientationOf(doc) === "portrait" ? t("cz.mediaSizeHeight") : t("cz.mediaSize")}</span><span className="text-muted font-normal">{t("cz.mediaValue", { n: pct(media) })}</span></span>
            <input type="range" min={spec.media.min} max={spec.media.max} step={0.01} value={media} data-testid="tpl-cz-media"
              onChange={(e) => update(withCustom(doc, (c) => { c.mediaSize = Number(e.target.value); }))} />
          </label>
          {custom?.mediaSize != null ? <button type="button" className="btn btn-quiet min-h-8 text-xs justify-self-start" onClick={() => reset("custom.mediaSize")} data-testid="tpl-cz-media-reset">{t("cz.reset")}</button> : null}
        </div>
      ) : null}
      <p className="text-xs text-muted">{t("cz.selectHint")}</p>
      <details className="tpl-adv" open={open} onToggle={(e) => onOpen((e.target as HTMLDetailsElement).open)} data-testid="tpl-cz-advanced">
        <summary>{t("cz.advanced")}</summary>
        <div className="grid gap-3 pt-3">
          <p className="text-xs text-muted">{t("cz.advancedNote")}</p>
          {roles.map((role) => (
            <RoleRow key={role} choices={fontWeightChoices(roleFont(doc, role))} testid={`tpl-cz-role-${role}`} label={t(`cz.role.${role}` as MessageKey)} value={custom?.roles?.[role]}
              onScale={(v) => setRole(role, { scale: v })} onWeight={(w) => setRole(role, { weight: w })} onReset={() => reset(`custom.roles.${role}`)} />
          ))}
          {spec.sectionHeadings ? (
            <fieldset className="grid gap-2 border border-line rounded-xl p-3" data-testid="tpl-cz-headings">
              <legend className="form-label px-1">{t("cz.role.sectionHeading")}</legend>
              <div className="seg" role="group" aria-label={t("cz.headingScope")}>
                <button type="button" aria-pressed={target == null} onClick={() => onScope("all")} data-testid="tpl-cz-heading-all">{t("cz.headingAll")}</button>
                <button type="button" aria-pressed={target != null} disabled={!named.length} onClick={() => onScope(named[0]?.i ?? 0)} data-testid="tpl-cz-heading-one">{t("cz.headingOne")}</button>
              </div>
              {target != null ? (
                <label className="text-sm grid gap-1">{t("cz.headingSection")}
                  <select className="field" value={target} data-testid="tpl-cz-heading-section" onChange={(e) => onScope(Number(e.target.value))}>
                    {named.map(({ s, i }) => <option key={i} value={i}>{s.name.trim() || t("cz.headingUntitled", { n: i + 1 })}</option>)}
                  </select>
                </label>
              ) : null}
              {target == null ? (
                <RoleRow choices={fontWeightChoices(roleFont(doc, "sectionHeading"))} testid="tpl-cz-role-sectionHeading" label={t("cz.headingAll")} value={custom?.roles?.sectionHeading}
                  onScale={(v) => setRole("sectionHeading", { scale: v })} onWeight={(w) => setRole("sectionHeading", { weight: w })} onReset={() => reset("custom.roles.sectionHeading")} />
              ) : (
                <RoleRow choices={fontWeightChoices(roleFont(doc, "sectionHeading"))} testid="tpl-cz-heading-override" label={t("cz.headingOne")} value={doc.sections[target]?.headingOverride}
                  onScale={(v) => setOverride({ scale: v })} onWeight={(w) => setOverride({ weight: w })} onReset={() => reset(`sections.${target}.headingOverride`)} />
              )}
            </fieldset>
          ) : null}
          {spec.spacing ? (
            <fieldset className="grid gap-2 border border-line rounded-xl p-3" data-testid="tpl-cz-spacing">
              <legend className="form-label px-1">{t("cz.spacing")}</legend>
              <label className="text-sm grid gap-1">{t("cz.itemGap", { n: pct(custom?.spacing?.itemGap ?? 1) })}
                <input type="range" min={SPACING_SCALE.min} max={SPACING_SCALE.max} step={0.05} value={custom?.spacing?.itemGap ?? 1} data-testid="tpl-cz-item-gap"
                  onChange={(e) => update(withCustom(doc, (c) => { c.spacing = { ...(c.spacing ?? {}), itemGap: Number(e.target.value) }; }))} />
              </label>
              <label className="text-sm grid gap-1">{t("cz.sectionGap", { n: pct(custom?.spacing?.sectionGap ?? 1) })}
                <input type="range" min={SPACING_SCALE.min} max={SPACING_SCALE.max} step={0.05} value={custom?.spacing?.sectionGap ?? 1} data-testid="tpl-cz-section-gap"
                  onChange={(e) => update(withCustom(doc, (c) => { c.spacing = { ...(c.spacing ?? {}), sectionGap: Number(e.target.value) }; }))} />
              </label>
              {custom?.spacing ? <button type="button" className="btn btn-quiet min-h-8 text-xs justify-self-start" onClick={() => reset("custom.spacing")} data-testid="tpl-cz-spacing-reset">{t("cz.reset")}</button> : null}
            </fieldset>
          ) : null}
          {spec.imageFocus ? (
            <fieldset className="grid gap-2 border border-line rounded-xl p-3" data-testid="tpl-cz-photo">
              <legend className="form-label px-1">{t("cz.photo")}</legend>
              {hasPhoto ? (
                <>
                  <div className="seg" role="group" aria-label={t("cz.photo")}>
                    <button type="button" aria-pressed={doc.imageFit !== "contain"} onClick={() => update({ ...doc, imageFit: "cover" })} data-testid="tpl-cz-fill">{t("cz.fill")}</button>
                    <button type="button" aria-pressed={doc.imageFit === "contain"} onClick={() => update({ ...doc, imageFit: "contain" })} data-testid="tpl-cz-fit">{t("cz.fitWhole")}</button>
                  </div>
                  {doc.imageFit !== "contain" ? (
                    <>
                      <label className="text-sm grid gap-1">{t("cz.focusX", { n: Math.round(custom?.imageFocus?.x ?? 50) })}
                        <input type="range" min={0} max={100} step={1} value={custom?.imageFocus?.x ?? 50} data-testid="tpl-cz-focus-x"
                          onChange={(e) => update(withCustom(doc, (c) => { c.imageFocus = { x: Number(e.target.value), y: c.imageFocus?.y ?? 50 }; }))} />
                      </label>
                      <label className="text-sm grid gap-1">{t("cz.focusY", { n: Math.round(custom?.imageFocus?.y ?? 50) })}
                        <input type="range" min={0} max={100} step={1} value={custom?.imageFocus?.y ?? 50} data-testid="tpl-cz-focus-y"
                          onChange={(e) => update(withCustom(doc, (c) => { c.imageFocus = { x: c.imageFocus?.x ?? 50, y: Number(e.target.value) }; }))} />
                      </label>
                      <p className="text-xs text-muted">{t("cz.focusNote")}</p>
                      {custom?.imageFocus ? <button type="button" className="btn btn-quiet min-h-8 text-xs justify-self-start" onClick={() => reset("custom.imageFocus")} data-testid="tpl-cz-focus-reset">{t("cz.reset")}</button> : null}
                    </>
                  ) : null}
                </>
              ) : <p className="text-xs text-muted">{t("cz.focusNeedsPhoto")}</p>}
            </fieldset>
          ) : null}
          {hasAny ? <button type="button" className="btn btn-quiet justify-self-start" onClick={() => reset("custom", "sections.*.headingOverride")} data-testid="tpl-cz-reset-all">{t("cz.resetAll")}</button> : null}
        </div>
      </details>
    </div>
  );
}
