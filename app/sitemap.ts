import type { MetadataRoute } from "next";
import { ENGLISH_ONLY_PUBLIC_PATHS, localizedPath, MARKETING_PATHS, siteOrigin } from "@/lib/seo";

const PRIORITY: Record<string, number> = { "/": 1, "/pricing": 0.9, "/features": 0.8, "/faq": 0.7, "/support": 0.5, "/contact": 0.4 };

/** Every indexable public URL, with English and Spanish alternates for the marketing pages. No invented dates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const abs = (path: string) => (path === "/" ? origin + "/" : origin + path);
  const marketing = MARKETING_PATHS.flatMap((path) => {
    const languages = { en: abs(localizedPath(path, "en")), es: abs(localizedPath(path, "es")), "x-default": abs(localizedPath(path, "en")) };
    return (["en", "es"] as const).map((locale) => ({
      url: abs(localizedPath(path, locale)),
      changeFrequency: "weekly" as const,
      priority: Math.max(0.1, (PRIORITY[path] ?? 0.5) - (locale === "es" ? 0.1 : 0)),
      alternates: { languages },
    }));
  });
  const legal = ENGLISH_ONLY_PUBLIC_PATHS.map((path) => ({ url: abs(path), changeFrequency: "yearly" as const, priority: 0.2 }));
  return [...marketing, ...legal];
}
