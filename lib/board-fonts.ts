/**
 * E6: the bundled faces a board can use. Every face is a self-hosted TTF in assets/fonts
 * (SIL OFL 1.1; licence files sit next to them), served by /layout-studio/media/font/[name]
 * for the editor preview and loaded by resvg for the published PNG, so preview and TV match.
 * No third-party font CDN.
 *
 * Inter and Noto Serif are unchanged, so existing boards render byte-for-byte as before.
 * New faces apply only when an owner picks them for a board or in Brand Kit (new content).
 */
export const BOARD_FONT_IDS = ["inter", "noto-serif", "oswald", "montserrat", "bebas-neue", "lobster"] as const;
export type BoardFontId = (typeof BOARD_FONT_IDS)[number];

type FaceFile = { name: string; file: string; weight: number };
type FontSpec = {
  id: BoardFontId;
  family: string;
  label: string;
  /** Short hint shown next to the choice. */
  hint: string;
  files: FaceFile[];
  /**
   * Multiplier for the board's text-width estimate. Inter and Noto Serif stay at 1 (unchanged
   * renders). Montserrat is wider than the estimate, so long text truncates a little earlier
   * instead of overflowing its column.
   */
  widthScale: number;
};

export const BOARD_FONTS: readonly FontSpec[] = [
  { id: "inter", family: "Inter", label: "Inter", hint: "Clean and easy to read", widthScale: 1, files: [
    { name: "inter", file: "Inter-Regular.ttf", weight: 400 },
    { name: "inter-bold", file: "Inter-Bold.ttf", weight: 700 },
    { name: "inter-extrabold", file: "Inter-ExtraBold.ttf", weight: 800 },
  ] },
  { id: "noto-serif", family: "Noto Serif", label: "Noto Serif", hint: "Classic serif", widthScale: 1, files: [
    { name: "noto-serif", file: "NotoSerif-Regular.ttf", weight: 400 },
    { name: "noto-serif-bold", file: "NotoSerif-Bold.ttf", weight: 700 },
  ] },
  { id: "oswald", family: "Oswald", label: "Oswald", hint: "Tall and condensed", widthScale: 1, files: [
    { name: "oswald", file: "Oswald-Regular.ttf", weight: 400 },
    { name: "oswald-bold", file: "Oswald-Bold.ttf", weight: 700 },
  ] },
  { id: "montserrat", family: "Montserrat", label: "Montserrat", hint: "Wide and modern", widthScale: 1.1, files: [
    { name: "montserrat", file: "Montserrat-Regular.ttf", weight: 400 },
    { name: "montserrat-bold", file: "Montserrat-Bold.ttf", weight: 700 },
    { name: "montserrat-extrabold", file: "Montserrat-ExtraBold.ttf", weight: 800 },
  ] },
  { id: "bebas-neue", family: "Bebas Neue", label: "Bebas Neue", hint: "All capitals, bold signage", widthScale: 1, files: [
    { name: "bebas-neue", file: "BebasNeue-Regular.ttf", weight: 400 },
  ] },
  { id: "lobster", family: "Lobster", label: "Lobster", hint: "Friendly script", widthScale: 1, files: [
    { name: "lobster", file: "Lobster-Regular.ttf", weight: 400 },
  ] },
];

export function isBoardFont(value: unknown): value is BoardFontId {
  return typeof value === "string" && (BOARD_FONT_IDS as readonly string[]).includes(value);
}

export function boardFont(id: BoardFontId | null | undefined): FontSpec {
  return BOARD_FONTS.find((font) => font.id === id) ?? BOARD_FONTS[0];
}

/** Font route name → file in assets/fonts. */
export const FONT_FILES: Record<string, string> = Object.fromEntries(
  BOARD_FONTS.flatMap((font) => font.files.map((face) => [face.name, face.file])),
);

/** Every bundled TTF, for resvg. */
export const ALL_FONT_FILES: string[] = BOARD_FONTS.flatMap((font) => font.files.map((face) => face.file));

/** Width multiplier for a rendered family name (see widthScale). */
export function widthScaleForFamily(family: string): number {
  return BOARD_FONTS.find((font) => font.family === family)?.widthScale ?? 1;
}

/**
 * @font-face rules for the editor preview, from the same files the renderer uses.
 * A family with a single file covers every weight, so the browser never fakes a bold
 * that resvg would not draw (preview stays true to the TV).
 */
export function fontFaceCss(ids: readonly BoardFontId[] = BOARD_FONT_IDS): string {
  return BOARD_FONTS.filter((font) => ids.includes(font.id)).flatMap((font) => {
    const family = font.family.includes(" ") ? `"${font.family}"` : font.family;
    return font.files.map((face) => {
      const weight = font.files.length === 1 ? "100 900" : String(face.weight);
      return `@font-face { font-family: ${family}; src: url("/layout-studio/media/font/${face.name}") format("truetype"); font-weight: ${weight}; font-style: normal; font-display: swap; }`;
    });
  }).join("\n");
}

export const FONT_CHOICE_ERROR = `Choose one of: ${BOARD_FONTS.map((font) => font.label).join(", ")}.`;
