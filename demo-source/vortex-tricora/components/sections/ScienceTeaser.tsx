import { OrbitMotif } from "@/components/ui/OrbitMotif";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { secondaryCta } from "@/content/navigation";

export function ScienceTeaser() {
  return (
    <section className="relative bg-bg-inverse text-text-primary-inverse py-24 md:py-28 text-center overflow-hidden">
      <OrbitMotif className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] md:w-[1100px] md:h-[1100px]" opacity={0.18} />
      <Reveal className="max-w-container mx-auto px-6 md:px-8 max-w-[620px] relative z-[2]">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-[#6FC7FF] mb-4">
          Science &amp; Technology
        </span>
        <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-5">
          The science is coming.
        </h2>
        <p className="text-lg text-text-secondary-inverse mb-10">
          We&rsquo;re preparing a closer look at the formulation behind Vortex Tricora. It isn&rsquo;t ready yet
          — but it will be, soon.
        </p>
        <Button href={secondaryCta.href} variant="secondary" onDark>
          {secondaryCta.label}
        </Button>
      </Reveal>
    </section>
  );
}
