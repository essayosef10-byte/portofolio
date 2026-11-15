import { Reveal } from "@/components/ui/Reveal";
import { product } from "@/content/product";

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-bg-secondary p-9 rounded">
      <h3 className="text-base font-semibold mb-4">{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item} className="text-[14.5px] text-text-secondary py-2 border-t border-border first:border-t-0 pl-4 relative">
            <span className="absolute left-0 text-text-muted">—</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CautionsStorage() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-container mx-auto px-6 md:px-8">
        <Reveal>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            Cautions &amp; Storage
          </span>
          <h2 className="font-display font-medium text-[28px] md:text-[42px] leading-[1.15] mb-9">
            Handle with care.
          </h2>
        </Reveal>
        <Reveal className="grid sm:grid-cols-2 gap-6">
          <InfoPanel title="Cautions" items={product.cautions} />
          <InfoPanel title="Storage" items={product.storage} />
        </Reveal>
        <Reveal>
          <p className="text-[13px] text-text-muted mt-10 pt-6 border-t border-border">
            For external use only. Vortex Tricora is not currently available for purchase — the product is
            pending registration and licensing.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
