import { Reveal } from "@/components/ui/Reveal";
import { product } from "@/content/product";

export function UsageFull() {
  return (
    <section className="bg-bg-secondary py-20 md:py-24">
      <div className="max-w-container mx-auto px-6 md:px-8 max-w-[720px]">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            How to Use
          </span>
          <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-4">
            Application instructions
          </h2>
        </Reveal>
        <div>
          {product.usageSteps.map((step, i) => (
            <Reveal key={step.title} className="grid grid-cols-[64px_1fr] gap-6 py-7 border-t border-border last:border-b">
              <span className="font-display text-[28px] font-normal text-accent-solid">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-semibold text-[17px] mb-1.5">{step.title}</h3>
                <p className="text-[15px] text-text-secondary">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
