import { en } from "@/lib/i18n/en";

/**
 * I18N-3: editor chrome moved into the dictionary. Source-string tests read a
 * component plus the English text of every t("key") it references, so a copy
 * check still proves the component shows that English text.
 */
export function withEn(src: string): string {
  const keys = new Set([...src.matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)].map((m) => m[1]));
  const dict = en as Record<string, string>;
  return src + "\n/* en */\n" + [...keys].map((k) => dict[k] ?? "").join("\n");
}
