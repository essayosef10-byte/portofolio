import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { primaryCta } from "@/content/navigation";

export function ClosingCta({ heading, cta = primaryCta }: { heading: string; cta?: { label: string; href: string } }) {
  return (
    <section className="py-24 md:py-28 text-center">
      <Reveal className="max-w-container mx-auto px-6 md:px-8">
        <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
          Vortex BioPharma
        </span>
        <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-9">{heading}</h2>
        <Button href={cta.href} variant={cta === primaryCta ? "primary" : "secondary"}>
          {cta.label}
        </Button>
      </Reveal>
    </section>
  );
}
