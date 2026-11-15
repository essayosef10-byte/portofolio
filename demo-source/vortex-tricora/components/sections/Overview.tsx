import { Reveal } from "@/components/ui/Reveal";
import { product } from "@/content/product";

export function Overview() {
  const rows: [string, string][] = [
    ["Brand", product.brand],
    ["Product", product.name],
    ["Type", product.type],
    ["Size", product.size],
    ["Formula", product.formulaName],
    ["Use", product.externalUseOnly],
  ];

  return (
    <section className="py-20 md:py-24">
      <div className="max-w-container mx-auto px-6 md:px-8 grid md:grid-cols-[0.9fr_1.1fr] gap-12 md:gap-20">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            Overview
          </span>
          <h2 className="font-display font-medium text-[26px] leading-[1.3] mb-4">
            A dedicated scalp serum, formulated for androgenetic alopecia.
          </h2>
          <p className="text-lg text-text-secondary">
            Vortex Tricora is presented ahead of Vortex BioPharma&rsquo;s official product launch. Registration
            and licensing are currently in progress.
          </p>
        </Reveal>
        <Reveal className="border-t border-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-6 py-5 border-b border-border">
              <span className="text-sm text-text-muted flex-none w-2/5">{label}</span>
              <span className="text-[15px] font-medium text-right">{value}</span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
