import { Reveal } from "@/components/ui/Reveal";

export function ProductIntro() {
  return (
    <section className="py-24 md:py-28">
      <div className="max-w-container mx-auto px-6 md:px-8 max-w-[760px]">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            Vortex Tricora
          </span>
          <div className="w-14 h-0.5 bg-accent-solid mb-7" />
          <p className="text-lg md:text-[19px] leading-[1.75] text-text-secondary">
            Vortex Tricora is a scalp serum developed for androgenetic alopecia. Formulated with ZnO
            Nanoparticles and an mDHT Complex, it is designed for daily application as part of a considered
            scalp-care routine — for external use only.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
