import { Bottle, Box } from "@/components/product/ProductAsset";
import { Button } from "@/components/ui/Button";
import { OrbitMotif } from "@/components/ui/OrbitMotif";
import { primaryCta, secondaryCta } from "@/content/navigation";

/**
 * Art-directed hero scene composed from two independent asset layers —
 * Box (smaller, offset back-left, slightly rotated, lower z-index and
 * opacity for depth) and Bottle (larger, centered, front layer) — rather
 * than a single flattened product photo. Each layer's size, position,
 * and z-index is controlled independently here.
 */
export function Hero() {
  return (
    <section className="relative bg-bg-inverse text-text-primary-inverse overflow-hidden pt-36 md:pt-44 pb-16 md:pb-24 min-h-[92vh] flex items-center">
      <OrbitMotif className="absolute top-1/2 -left-[10%] -translate-y-1/2 w-[600px] h-[600px] md:w-[900px] md:h-[900px]" opacity={0.3} />

      <div className="max-w-container mx-auto px-6 md:px-8 grid md:grid-cols-[1.05fr_0.95fr] gap-14 md:gap-10 items-center relative z-[2] w-full">
        <div>
          <span className="block text-sm font-semibold tracking-[0.16em] uppercase text-text-secondary-inverse mb-5">
            Vortex BioPharma
          </span>
          <h1 className="font-display font-medium leading-[0.98] text-[44px] sm:text-[56px] md:text-[72px] lg:text-[84px] mb-5 bg-gradient-to-br from-white to-[#BFE0FF] bg-clip-text text-transparent">
            Vortex
            <br />
            Tricora
          </h1>
          <div className="font-display text-xl md:text-2xl font-normal text-text-secondary-inverse mb-7">
            Advanced Scalp Serum
          </div>
          <p className="text-text-secondary-inverse text-[17px] max-w-[460px] mb-10">
            A scalp serum formulated with ZnO Nanoparticles and an mDHT Complex, presented ahead of Vortex
            BioPharma&rsquo;s official launch.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button href={primaryCta.href} variant="primary" onDark>
              {primaryCta.label}
            </Button>
            <Button href={secondaryCta.href} variant="secondary" onDark>
              {secondaryCta.label}
            </Button>
          </div>
        </div>

        <div className="relative h-[380px] md:h-[600px] flex items-center justify-center">
          <div className="absolute w-[380px] h-[380px] md:w-[420px] md:h-[420px] rounded-full bg-[radial-gradient(circle,rgba(111,199,255,0.18),transparent_70%)]" />
          {/* Depth layer: Box, smaller, offset back-left, softened */}
          <Box
            className="absolute left-[6%] md:left-[2%] bottom-[6%] w-[34%] md:w-[38%] h-auto opacity-70 blur-[1px] drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)] rotate-[-4deg]"
            sizes="(max-width: 768px) 40vw, 20vw"
          />
          {/* Front layer: Bottle, larger, centered */}
          <Bottle
            priority
            className="relative w-[58%] md:w-[54%] h-auto drop-shadow-[0_40px_60px_rgba(0,0,0,0.5)]"
            sizes="(max-width: 768px) 60vw, 30vw"
          />
        </div>
      </div>

      <div className="hidden md:flex absolute bottom-9 left-8 items-center gap-2.5 text-[12px] tracking-[0.1em] uppercase text-text-secondary-inverse z-[2]">
        <span>Scroll</span>
        <span className="w-px h-8 bg-gradient-to-b from-text-secondary-inverse to-transparent" />
      </div>
    </section>
  );
}
