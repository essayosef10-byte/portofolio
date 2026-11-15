import type { Metadata } from "next";
import { siteMeta, robotsDirective } from "@/content/site-meta";
import { brand } from "@/content/brand";

export const metadata: Metadata = {
  title: siteMeta.contact.title,
  description: siteMeta.contact.description,
  robots: robotsDirective,
};

/**
 * Reserved route — not in public navigation. The packaging-sourced
 * candidate contact values in content/brand.ts are intentionally not
 * rendered here until `contact.approved` is set to true.
 */
export default function ContactPage() {
  const { contact } = brand;

  return (
    <main className="pt-36 md:pt-44 pb-24 min-h-[60vh]">
      <div className="max-w-container mx-auto px-6 md:px-8 max-w-[720px]">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
          {brand.name}
        </span>
        {contact.approved ? (
          <div className="text-lg text-text-secondary space-y-2">
            <p>{contact.candidate.company}</p>
            <p>{contact.candidate.city}</p>
            <p>{contact.candidate.website}</p>
          </div>
        ) : (
          <h1 className="font-display font-medium text-[28px] leading-[1.3] text-text-secondary">
            {brand.name}
          </h1>
        )}
      </div>
    </main>
  );
}
