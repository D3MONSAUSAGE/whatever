import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

/**
 * Crawlers may read the public site. Signed-in areas, APIs, the TV player and internal tools are excluded;
 * they are not useful in search results (sign-in pages also carry noindex).
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/developer", "/dev/", "/preview", "/layout-studio", "/auth/", "/player", "/tv", "/pair"],
    }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
