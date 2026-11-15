import type { Metadata } from "next";

// Pre-launch: the site is indexable=false, crawlable=true (noindex, follow)
// via Next.js metadata robots directives — not a robots.txt disallow — so
// search engines can read the noindex tag instead of being blocked from
// the page entirely. Flip PRELAUNCH to false and this switches to a
// normal indexable configuration with no structural changes elsewhere.
export const PRELAUNCH = true;

export const robotsDirective: Metadata["robots"] = PRELAUNCH
  ? { index: false, follow: true }
  : { index: true, follow: true };

export const siteMeta = {
  home: {
    title: "Vortex Tricora | Vortex BioPharma",
    description:
      "Vortex Tricora — an advanced scalp serum from Vortex BioPharma. Presented ahead of official launch.",
  },
  tricora: {
    title: "Vortex Tricora — Scalp Serum | Vortex BioPharma",
    description:
      "Vortex Tricora scalp serum: overview, usage, cautions and storage information.",
  },
  science: {
    title: "Science & Technology | Vortex BioPharma",
    description: "The science behind Vortex Tricora — coming soon.",
  },
  about: {
    title: "About | Vortex BioPharma",
    description: "About Vortex BioPharma.",
  },
  contact: {
    title: "Contact | Vortex BioPharma",
    description: "Contact Vortex BioPharma.",
  },
};
