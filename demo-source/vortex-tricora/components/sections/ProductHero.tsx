import { Bottle } from "@/components/product/ProductAsset";
import { Button } from "@/components/ui/Button";
import { product } from "@/content/product";
import { secondaryCta } from "@/content/navigation";

export function ProductHero() {
  return (
    <section className="pt-36 md:pt-44 pb-16 md:pb-24">
      <div className="max-w-container mx-auto px-6 md:px-8 grid md:grid-cols-[0.85fr_1.15fr] gap-12 md:gap-16 items-center">
        <div className="order-first md:order-last flex justify-center">
          <Bottle priority className="max-h-[380px] md:max-h-[560px] w-auto drop-shadow-[0_30px_50px_rgba(11,18,32,0.14)]" sizes="(max-width: 768px) 60vw, 30vw" />
        </div>
        <div>
          <span className="block text-[13px] font-semibold tracking-[0.14em] uppercase text-accent-solid mb-4">
            {product.brand}
          </span>
          <h1 className="font-display font-medium text-[38px] sm:text-[48px] md:text-[62px] leading-[1.02] mb-3">
            {product.name}
          </h1>
          <div className="font-display text-xl text-text-secondary mb-7">{product.category}</div>
          <span className="inline-block bg-bg-inverse text-white text-[13px] font-medium px-4 py-2 rounded mb-6">
            {product.formulaName}
          </span>
          <div className="flex flex-wrap gap-2.5 mb-9">
            {[product.size, product.type, "For External Use Only"].map((chip) => (
              <span key={chip} className="text-[13px] font-medium px-4 py-2 rounded-full border border-border text-text-secondary">
                {chip}
              </span>
            ))}
          </div>
          <Button href={secondaryCta.href} variant="primary">
            {secondaryCta.label}
          </Button>
        </div>
      </div>
    </section>
  );
}
