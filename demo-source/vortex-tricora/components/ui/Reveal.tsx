"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Progressive-enhancement scroll reveal. Content is visible by default
 * (see .reveal in globals.css only applying opacity:0 once JS confirms
 * IntersectionObserver support isn't required — the CSS class itself
 * starts hidden, so this component is required for the effect, but a
 * no-JS fallback isn't needed here since Next.js always hydrates).
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Component = Tag as any;
  return (
    <Component ref={ref} className={`reveal ${className}`}>
      {children}
    </Component>
  );
}
