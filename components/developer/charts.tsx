"use client";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Small, dependency-free charts for the developer console (dark surface). Palette validated with the dataviz
 * checks against the console surface (#0c1530): categorical slots blue / orange / aqua for up to three series,
 * and a one-hue ordinal blue ramp for ordered buckets. Marks are thin (bars <= 24px, 4px rounded data ends,
 * 2px lines), every chart with two or more series has a legend, values are direct-labelled where they fit,
 * and each chart has a table view. Hidden small groups (null) are drawn as "<3", never as zero.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70"] as const;
export const ORDINAL_BLUE = ["#9ec5f4", "#5598e7", "#256abf", "#184f95"] as const;
export const NEUTRAL = "#5b6476";

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Collapsible table view that every chart offers (accessibility + exact numbers). */
export function TableView({ label, head, rows }: { label: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="dc-table-view">
      <summary>{label}</summary>
      <div className="dc-table-wrap">
        <table className="dc-table">
          <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="dc-legend">
      {items.map((it) => (
        <li key={it.label}><span className="dc-swatch" style={{ background: it.color }} aria-hidden="true" />{it.label}{it.value !== undefined ? <b>{it.value}</b> : null}</li>
      ))}
    </ul>
  );
}

/** One series of columns over time (weekly sign-ups). null = hidden small group. */
export function ColumnChart({ points, label, format, hiddenText, hiddenTitle }: {
  points: { key: string; label: string; value: number | null }[];
  label: string;
  format: (n: number) => string;
  hiddenText: string;
  hiddenTitle: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 200, top = 22, bottom = 26, left = 34, right = 8;
  const innerW = width - left - right, innerH = H - top - bottom;
  const max = niceMax(Math.max(3, ...points.map((p) => p.value ?? 0)));
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.min(24, Math.max(6, slot * 0.6));
  const y = (v: number) => top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 64))));
  return (
    <div ref={ref} className="dc-chart" role="img" aria-label={label}>
      <svg width={width} height={H} aria-hidden="true">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={left} x2={width - right} y1={y(tk)} y2={y(tk)} className="dc-grid" />
            <text x={left - 8} y={y(tk) + 4} textAnchor="end" className="dc-axis">{format(tk)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = left + slot * i + slot / 2;
          const x = cx - barW / 2;
          const active = hover === i;
          return (
            <g key={p.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={left + slot * i} y={top} width={slot} height={innerH} fill="transparent" />
              {p.value === null ? (
                <>
                  <rect x={x} y={y(1.5)} width={barW} height={y(0) - y(1.5)} rx={4} className="dc-hidden-bar" />
                  <text x={cx} y={y(1.5) - 6} textAnchor="middle" className="dc-axis">{hiddenText}</text>
                </>
              ) : p.value > 0 ? (
                <path d={`M${x},${y(0)} V${y(p.value) + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z`} fill={SERIES[0]} opacity={hover === null || active ? 1 : 0.55} />
              ) : null}
              {i % labelEvery === 0 ? <text x={cx} y={H - 8} textAnchor="middle" className="dc-axis">{p.label}</text> : null}
            </g>
          );
        })}
        <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="dc-baseline" />
      </svg>
      {hover !== null ? (
        <div className="dc-tooltip" style={{ left: Math.min(width - 150, Math.max(0, left + slot * hover + slot / 2 - 70)), top: 0 }}>
          <span>{points[hover].label}</span>
          <b>{points[hover].value === null ? hiddenTitle : format(points[hover].value as number)}</b>
        </div>
      ) : null}
    </div>
  );
}

/** Two or three daily series on one shared axis (publishing). Crosshair + tooltip on hover. */
export function LineChart({ days, series, label, dayLabel, format }: {
  days: string[];
  series: { name: string; values: number[] }[];
  label: string;
  dayLabel: (d: string) => string;
  format: (n: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clip = useId().replace(/:/g, "");
  const H = 220, top = 16, bottom = 26, left = 34, right = 12;
  const innerW = width - left - right, innerH = H - top - bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(1, days.length - 1);
  const x = (i: number) => left + (innerW * i) / n;
  const y = (v: number) => top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - left) / innerW) * n);
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };
  const labelIdx = days.length <= 1 ? [0] : [0, Math.floor((days.length - 1) / 2), days.length - 1];
  return (
    <div ref={ref} className="dc-chart" role="img" aria-label={label}>
      <svg width={width} height={H} aria-hidden="true" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs><clipPath id={clip}><rect x={left} y={0} width={innerW + 2} height={H} /></clipPath></defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={left} x2={width - right} y1={y(tk)} y2={y(tk)} className="dc-grid" />
            <text x={left - 8} y={y(tk) + 4} textAnchor="end" className="dc-axis">{format(tk)}</text>
          </g>
        ))}
        {labelIdx.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="dc-axis">{dayLabel(days[i])}</text>)}
        <g clipPath={`url(#${clip})`}>
          {series.map((s, si) => <path key={s.name} d={path(s.values)} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        </g>
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + innerH} className="dc-crosshair" />
            {series.map((s, si) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={SERIES[si]} stroke="#0c1530" strokeWidth={2} />)}
          </g>
        ) : null}
        <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="dc-baseline" />
      </svg>
      {hover !== null ? (
        <div className="dc-tooltip" style={{ left: Math.min(width - 180, Math.max(0, x(hover) + 12)), top: 8 }}>
          <span>{dayLabel(days[hover])}</span>
          {series.map((s, si) => <span key={s.name} className="dc-tip-row"><i style={{ background: SERIES[si] }} />{s.name}<b>{format(s.values[hover])}</b></span>)}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal bars with direct labels (funnel steps, channels, grouped windows). null = hidden small group. */
export function BarRows({ rows, max, color = SERIES[0], hiddenText }: {
  rows: { key: string; label: string; value: number | null; display: string; note?: string; color?: string }[];
  max?: number;
  color?: string;
  hiddenText: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="dc-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="dc-bar-head"><span>{r.label}</span><b>{r.value === null ? hiddenText : r.display}</b></div>
          <div className="dc-track">
            {r.value === null ? <span className="dc-fill dc-fill-hidden" style={{ width: "6%" }} />
              : <span className="dc-fill" style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / top) * 100)}%`, background: r.color ?? color }} />}
          </div>
          {r.note ? <div className="dc-bar-note">{r.note}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/** One whole split into ordered parts (screen check-in freshness). */
export function SegmentedBar({ parts, label }: { parts: { key: string; label: string; value: number; color: string; display: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="dc-segbar" role="img" aria-label={label}>
        {total === 0 ? <span className="dc-seg" style={{ flex: 1, background: "rgb(255 255 255 / 0.06)" }} /> : parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} className="dc-seg" style={{ flex: p.value, background: p.color }} title={`${p.label}: ${p.display}`} />
        ))}
      </div>
      <Legend items={parts.map((p) => ({ label: p.label, color: p.color, value: p.display }))} />
    </div>
  );
}

/** A 0..1 share as a thin meter (retention, rates). null = hidden or not mature. */
export function Meter({ value }: { value: number | null }) {
  return (
    <div className="dc-meter" aria-hidden="true">
      {value === null ? null : <span style={{ width: `${Math.max(value > 0 ? 2 : 0, Math.min(100, value * 100))}%` }} />}
    </div>
  );
}
