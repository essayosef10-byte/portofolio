import Image from "next/image";

type LogoProps = {
  /** Which packaging-approved lockup to render — never redrawn or recolored. */
  variant: "full-light" | "full-dark" | "symbol-light" | "symbol-dark";
  className?: string;
  priority?: boolean;
};

const SRC: Record<LogoProps["variant"], { src: string; w: number; h: number }> = {
  "full-light": { src: "/assets/brand/vortex-biopharma-logo-light.png", w: 200, h: 40 },
  "full-dark": { src: "/assets/brand/vortex-biopharma-logo-dark.png", w: 200, h: 40 },
  "symbol-light": { src: "/assets/brand/vortex-biopharma-symbol-light.png", w: 40, h: 36 },
  "symbol-dark": { src: "/assets/brand/vortex-biopharma-symbol-dark.png", w: 40, h: 36 },
};

export function Logo({ variant, className = "", priority = false }: LogoProps) {
  const { src, w, h } = SRC[variant];
  return (
    <Image
      src={src}
      alt="Vortex BioPharma"
      width={w}
      height={h}
      priority={priority}
      className={`h-7 w-auto ${className}`}
    />
  );
}
