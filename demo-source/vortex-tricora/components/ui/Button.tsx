import Link from "next/link";
import type { ReactNode } from "react";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  onDark?: boolean;
  className?: string;
};

/**
 * Two variants only, per the locked component language: a solid Primary
 * for "Discover Tricora"-tier CTAs, and an outline Secondary for
 * "Explore the Science"-tier CTAs. No pill radius, no third variant.
 */
export function Button({ href, children, variant = "primary", onDark = false, className = "" }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center min-h-[44px] px-7 py-3.5 rounded-md text-[15px] font-medium tracking-[0.01em] transition-colors duration-200";

  const styles = {
    primary: onDark
      ? "bg-white text-bg-inverse hover:bg-[#dfe6f2]"
      : "bg-accent-solid text-white hover:bg-accent-solid-hover",
    secondary: onDark
      ? "bg-transparent text-text-primary-inverse border border-border-inverse hover:border-[#6FC7FF] hover:text-[#6FC7FF]"
      : "bg-transparent text-text-primary border border-border hover:border-accent-solid hover:text-accent-solid",
  };

  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}
