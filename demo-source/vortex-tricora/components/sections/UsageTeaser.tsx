import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { product } from "@/content/product";

export function UsageTeaser() {
  return (
    <section className="py-24 md:py-28">
      <div className="max-w-container mx-auto px-6 md:px-8">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            How to Use
          </span>
          <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-12">
            A simple, twice-daily ritual.
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {product.usageSteps.map((step, i) => (
            <Reveal key={step.title} className="border-t border-border pt-5">
              <span className="block font-display text-sm text-accent-solid mb-2.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[15px] text-text-secondary">{step.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-11">
          <Button href="/tricora" variant="secondary">
            Full usage instructions
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
