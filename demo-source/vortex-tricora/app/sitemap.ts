import type { MetadataRoute } from "next";

// Structural only during pre-launch — indexing is controlled via the
// noindex,follow robots metadata (see content/site-meta.ts), not by
// withholding or activating this sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.vortexbiopharma.com";
  return [
    { url: `${base}/`, changeFrequency: "monthly" },
    { url: `${base}/tricora`, changeFrequency: "monthly" },
    { url: `${base}/science`, changeFrequency: "monthly" },
  ];
}
