import type { Metadata } from "next";
import { siteMeta, robotsDirective } from "@/content/site-meta";
import { ProductHero } from "@/components/sections/ProductHero";
import { Overview } from "@/components/sections/Overview";
import { PackagingSection } from "@/components/sections/PackagingSection";
import { UsageFull } from "@/components/sections/UsageFull";
import { CautionsStorage } from "@/components/sections/CautionsStorage";
import { ClosingCta } from "@/components/sections/ClosingCta";
import { secondaryCta } from "@/content/navigation";

export const metadata: Metadata = {
  title: siteMeta.tricora.title,
  description: siteMeta.tricora.description,
  robots: robotsDirective,
};

export default function TricoraPage() {
  return (
    <main>
      <ProductHero />
      <Overview />
      <PackagingSection />
      <UsageFull />

      {/*
        Reserved: RegulatoryInfo component slot.
        Hidden from the public UI until an approved registration/license
        number is provided (see content/product.ts — product.regulatory).
        Do not render a placeholder here.
      */}

      <CautionsStorage />
      <ClosingCta heading="Learn what's next." cta={secondaryCta} />
    </main>
  );
}
