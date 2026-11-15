import Image, { type ImageProps } from "next/image";

/**
 * Modular product-image system.
 *
 * Each of Bottle, Box, and BottleBox wraps one independently-sourced,
 * pre-isolated transparent PNG (public/assets/product/*). None of these
 * are cropped from a shared flattened reference photo — each asset was
 * extracted independently, so any of the three can be positioned, scaled,
 * layered, or animated on its own without carrying baggage from the
 * others (no shared background, no shared shadow, no fixed aspect
 * relationship between them).
 *
 * Composition (relative positioning, layering, environmental shadow/glow,
 * motion) is the caller's responsibility via className/style — these
 * components only render the authentic, untouched product asset.
 */

type AssetProps = Omit<ImageProps, "src" | "alt"> & { className?: string };

const ASSET = {
  bottle: { src: "/assets/product/vortex-tricora-bottle.png", w: 900, h: 1377, alt: "Vortex Tricora scalp serum bottle with dropper, 50ml" },
  box: { src: "/assets/product/vortex-tricora-box.png", w: 900, h: 1423, alt: "Vortex Tricora packaging box, 50ml scalp serum" },
  bottleBox: { src: "/assets/product/vortex-tricora-bottle-box.png", w: 1061, h: 984, alt: "Vortex Tricora bottle and packaging box together, 50ml scalp serum" },
} as const;

function Asset({ kind, className = "", fill, ...rest }: AssetProps & { kind: keyof typeof ASSET }) {
  const { src, w, h, alt } = ASSET[kind];
  const dims = fill ? {} : { width: w, height: h };
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      {...dims}
      className={className}
      {...rest}
    />
  );
}

export function Bottle(props: AssetProps) {
  return <Asset kind="bottle" {...props} />;
}

export function Box(props: AssetProps) {
  return <Asset kind="box" {...props} />;
}

export function BottleBox(props: AssetProps) {
  return <Asset kind="bottleBox" {...props} />;
}
