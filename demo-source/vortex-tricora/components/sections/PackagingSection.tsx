import { Box, Bottle } from "@/components/product/ProductAsset";
import { Reveal } from "@/components/ui/Reveal";

/**
 * A second, independently art-directed composition of the two standalone
 * assets — distinct from both the Hero's layered scene and the Home
 * page's pre-shot Bottle+Box pairing. Demonstrates that Box and Bottle
 * can be recomposed freely per section rather than reusing one fixed
 * arrangement everywhere.
 */
export function PackagingSection() {
  return (
    <section className="bg-bg-secondary py-20 md:py-24 overflow-hidden">
      <div className="max-w-container mx-auto px-6 md:px-8 grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            Packaging
          </span>
          <h2 className="font-display font-medium text-[26px] md:text-[32px] leading-[1.25] mb-4">
            Each bottle ships in its own sealed carton.
          </h2>
          <p className="text-lg text-text-secondary max-w-[480px]">
            The outer box carries the same information as the bottle label, so the product can be identified and
            handled correctly before it&rsquo;s ever opened.
          </p>
        </Reveal>
        <Reveal className="relative h-[320px] md:h-[420px] flex items-center justify-center">
          <Box className="absolute left-[8%] w-[52%] md:w-[48%] h-auto drop-shadow-[0_25px_40px_rgba(11,18,32,0.16)] -rotate-3" sizes="(max-width: 768px) 45vw, 22vw" />
          <Bottle className="absolute right-[6%] w-[38%] md:w-[34%] h-auto drop-shadow-[0_25px_40px_rgba(11,18,32,0.16)] rotate-2" sizes="(max-width: 768px) 32vw, 16vw" />
        </Reveal>
      </div>
    </section>
  );
}
