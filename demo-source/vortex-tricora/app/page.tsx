import type { Metadata } from "next";
import { siteMeta, robotsDirective } from "@/content/site-meta";
import { Hero } from "@/components/sections/Hero";
import { ProductIntro } from "@/components/sections/ProductIntro";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { UsageTeaser } from "@/components/sections/UsageTeaser";
import { ScienceTeaser } from "@/components/sections/ScienceTeaser";
import { StorySection } from "@/components/sections/StorySection";
import { ClosingCta } from "@/components/sections/ClosingCta";

export const metadata: Metadata = {
  title: siteMeta.home.title,
  description: siteMeta.home.description,
  robots: robotsDirective,
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <ProductIntro />
      <ProductShowcase />
      <UsageTeaser />
      <ScienceTeaser />
      <StorySection />
      <ClosingCta heading="Discover Vortex Tricora." />
    </main>
  );
}
