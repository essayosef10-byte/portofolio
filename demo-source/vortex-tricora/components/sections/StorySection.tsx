import { Bottle } from "@/components/product/ProductAsset";

/**
 * Full-bleed atmospheric moment. Uses the same authoritative isolated
 * Bottle asset (not a crop of the old flattened reference photo) set
 * against a dark gradient backdrop, with CSS handling the environmental
 * lighting/vignette rather than any baked-in photographic background.
 */
export function StorySection() {
  return (
    <section className="relative h-[60vh] min-h-[420px] overflow-hidden bg-gradient-to-b from-[#0B1C3D] to-[#03112B]">
      <Bottle
        fill
        className="object-cover opacity-95"
        style={{ objectPosition: "50% 15%" }}
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(3,17,43,0.65)]" />
      <div className="absolute bottom-10 left-0 right-0 text-center">
        <p className="font-display text-xl md:text-[28px] font-normal text-white" style={{ textShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>
          Considered, down to the dropper.
        </p>
      </div>
    </section>
  );
}
