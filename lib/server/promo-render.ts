import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { promoBase, type PromoContent, type PromoTemplate } from "@/lib/promo-templates";
import { MENU_HEIGHT, MENU_WIDTH, approxWidth, esc, fit, mix, onColor, themeFor, type MenuArt } from "./menu-render";

/** Split text into at most `lines` lines that fit `max`; the last line is shortened if needed. */
export function wrap(s: string, size: number, max: number, weight: number, lines = 2) {
  const words = s.split(" ");
  const out: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (approxWidth(next, size, weight) <= max || !line) { line = next; continue; }
    out.push(line);
    line = words[i];
    if (out.length === lines - 1) { line = words.slice(i).join(" "); break; }
  }
  if (line) out.push(line);
  return out.slice(0, lines).map((l, i, a) => (i === a.length - 1 ? fit(l, size, max, weight) : l));
}

export function promoSvg(template: PromoTemplate, content: PromoContent, art: MenuArt = {}) {
  const base = promoBase(template);
  const t = themeFor(base, content.useBrand === false ? null : art.brand);
  const W0 = MENU_WIDTH, H = MENU_HEIGHT, pad = 120;
  const photoW = art.photo ? Math.round(W0 * 0.45) : 0;
  const W = W0 - photoW;
  const accent = t.priceBg ?? t.section;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W0}" height="${H}" viewBox="0 0 ${W0} ${H}">`);
  out.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>`);
  out.push(`<rect width="${W0}" height="${H}" fill="url(#g)"/>`);
  if (t.band) out.push(`<rect width="28" height="${H}" fill="${t.band}"/>`);
  if (art.photo) {
    out.push(`<clipPath id="photo"><rect x="${W}" y="0" width="${photoW}" height="${H}"/></clipPath>`);
    out.push(`<image href="${art.photo}" x="${W}" y="0" width="${photoW}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`);
  }
  const maxW = W - 2 * pad;
  if (art.logo) {
    const box = art.photo ? { w: 220, h: 100 } : { w: 300, h: 120 };
    out.push(`<image href="${art.logo}" x="${W - 60 - box.w}" y="60" width="${box.w}" height="${box.h}" preserveAspectRatio="xMaxYMid meet"/>`);
  }

  // Block layout, vertically centred.
  const blocks: { h: number; draw: (y: number) => string }[] = [];
  if (content.tag) {
    const size = 40, label = content.tag.toUpperCase();
    const w = Math.min(maxW, approxWidth(label, size, 700) * 1.08 + 64);
    const fill = t.band ?? accent, ink = onColor(fill);
    blocks.push({ h: 90, draw: (y) => `<rect x="${pad}" y="${y}" width="${w.toFixed(0)}" height="66" rx="33" fill="${fill}"/><text x="${pad + 32}" y="${y + 46}" font-size="${size}" font-weight="700" letter-spacing="3" fill="${ink}">${esc(fit(label, size, w - 64, 700))}</text>` });
  }
  let hs = 150;
  while (hs > 96 && wrap(content.headline, hs, maxW, 800).some((l) => approxWidth(l, hs, 800) > maxW)) hs -= 6;
  const lines = wrap(content.headline, hs, maxW, 800);
  blocks.push({ h: lines.length * hs * 1.05 + 10, draw: (y) => lines.map((l, i) => `<text x="${pad}" y="${(y + hs * (0.9 + i * 1.05)).toFixed(0)}" font-size="${hs}" font-weight="800" fill="${t.text}">${esc(l)}</text>`).join("") });
  if (content.subheadline) {
    blocks.push({ h: 80, draw: (y) => `<text x="${pad}" y="${y + 56}" font-size="52" fill="${t.muted}">${esc(fit(content.subheadline, 52, maxW))}</text>` });
  }
  if (content.price) {
    const size = 120, w = approxWidth(content.price, size, 800) + 80;
    const fill = accent, ink = onColor(fill);
    blocks.push({ h: 200, draw: (y) => `<rect x="${pad}" y="${y + 30}" width="${Math.min(w, maxW).toFixed(0)}" height="160" rx="28" fill="${fill}"/><text x="${pad + 40}" y="${y + 150}" font-size="${size}" font-weight="800" fill="${ink}">${esc(fit(content.price, size, maxW - 80, 800))}</text>` });
  }
  if (content.details) {
    const dl = wrap(content.details, 40, maxW, 400);
    blocks.push({ h: dl.length * 52 + 30, draw: (y) => dl.map((l, i) => `<text x="${pad}" y="${y + 60 + i * 52}" font-size="40" fill="${t.text}">${esc(l)}</text>`).join("") });
  }
  const total = blocks.reduce((n, b) => n + b.h + 20, 0);
  const footerH = content.footer ? 160 : 0;
  const top = art.logo ? 200 : 90;
  const room = H - footerH - top - 30;
  const scale = Math.min(1, room / total);
  const y0 = Math.max(top, (H - footerH - total * scale) / 2);
  out.push(scale < 1 ? `<g transform="translate(${pad} ${y0.toFixed(1)}) scale(${scale.toFixed(3)}) translate(${-pad} ${(-y0).toFixed(1)})">` : "<g>");
  let y = y0;
  for (const b of blocks) { out.push(b.draw(y)); y += b.h + 20; }
  out.push("</g>");
  if (content.footer) {
    out.push(`<rect x="${pad}" y="${H - 140}" width="${maxW}" height="2" fill="${mix(t.bg, t.text, 0.2)}"/>`);
    out.push(`<text x="${pad}" y="${H - 70}" font-size="44" font-weight="700" fill="${t.section}">${esc(fit(content.footer, 44, maxW, 700))}</text>`);
  }
  out.push("</svg>");
  return out.join("");
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONTS = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"].map((f) => path.join(FONT_DIR, f));

export function renderPromoPng(template: PromoTemplate, content: PromoContent, art: MenuArt = {}): Uint8Array {
  const resvg = new Resvg(promoSvg(template, content, art), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  return new Uint8Array(resvg.render().asPng());
}
