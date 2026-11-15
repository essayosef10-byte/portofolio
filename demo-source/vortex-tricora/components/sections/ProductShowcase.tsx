import { BottleBox } from "@/components/product/ProductAsset";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Uses the combined Bottle+Box asset directly — this is a case where the
 * pre-composed pairing genuinely reads better than assembling the two
 * independently, since it shows their true relative scale as photographed.
 */
export function ProductShowcase() {
  return (
    <section className="bg-bg-secondary py-24 md:py-28">
      <div className="max-w-container mx-auto px-6 md:px-8 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        <Reveal className="order-2 md:order-1">
          <BottleBox className="w-full h-auto" sizes="(max-width: 768px) 90vw, 45vw" />
        </Reveal>
        <Reveal className="order-1 md:order-2">
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            The Product
          </span>
          <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-5">
            Precision, in fifty millilitres.
          </h2>
          <p className="text-lg text-text-secondary max-w-[560px] mb-7">
            Every detail of the Tricora bottle — from the amber glass to the calibrated dropper — is built for a
            single purpose: consistent, careful application.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {["50ml", "Scalp Serum", "External Use Only"].map((chip) => (
              <span key={chip} className="text-[13px] font-medium px-4 py-2 rounded-full border border-border bg-white text-text-secondary">
                {chip}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
