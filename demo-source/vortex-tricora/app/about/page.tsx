import type { Metadata } from "next";
import { siteMeta, robotsDirective } from "@/content/site-meta";
import { brand } from "@/content/brand";

export const metadata: Metadata = {
  title: siteMeta.about.title,
  description: siteMeta.about.description,
  robots: robotsDirective,
};

/**
 * Reserved route — not in public navigation. Every section here is
 * conditional on approved content existing in content/brand.ts. Nothing
 * is fabricated and no "placeholder" copy is shown; sections simply
 * don't render until real, approved content is supplied.
 */
export default function AboutPage() {
  const { about } = brand;
  const hasAnyContent = about.intro || about.mission || about.facilities || about.certifications || about.team.length > 0;

  return (
    <main className="pt-36 md:pt-44 pb-24 min-h-[60vh]">
      <div className="max-w-container mx-auto px-6 md:px-8 max-w-[720px]">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
          {brand.name}
        </span>
        {about.intro && <p className="text-lg text-text-secondary mb-6">{about.intro}</p>}
        {about.mission && <p className="text-lg text-text-secondary mb-6">{about.mission}</p>}
        {about.facilities && <p className="text-lg text-text-secondary mb-6">{about.facilities}</p>}
        {about.certifications && <p className="text-lg text-text-secondary mb-6">{about.certifications}</p>}
        {!hasAnyContent && (
          <h1 className="font-display font-medium text-[28px] leading-[1.3] text-text-secondary">
            {brand.name}
          </h1>
        )}
      </div>
    </main>
  );
}
