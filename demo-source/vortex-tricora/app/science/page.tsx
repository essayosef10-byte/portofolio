import type { Metadata } from "next";
import { siteMeta, robotsDirective } from "@/content/site-meta";
import { OrbitMotif } from "@/components/ui/OrbitMotif";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: siteMeta.science.title,
  description: siteMeta.science.description,
  robots: robotsDirective,
};

export default function SciencePage() {
  return (
    <main>
      <section className="relative min-h-screen flex items-center justify-center text-center bg-bg-inverse text-white overflow-hidden">
        <OrbitMotif className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] md:w-[1100px] md:h-[1100px]" opacity={0.18} />
        <div className="relative z-[2] max-w-[520px] px-6">
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-[#6FC7FF] mb-4">
            Science &amp; Technology
          </span>
          <h1 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-4">
            Coming soon.
          </h1>
          <p className="text-lg text-text-secondary-inverse mb-9">
            We&rsquo;re preparing a closer look at the science behind Vortex Tricora. Check back soon.
          </p>
          <Button href="/tricora" variant="secondary" onDark>
            Back to Tricora
          </Button>
        </div>
      </section>
    </main>
  );
}
