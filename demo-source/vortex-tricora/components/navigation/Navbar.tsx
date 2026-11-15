"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { navigation, primaryCta } from "@/content/navigation";

/**
 * Per-route navbar skin:
 * - Home's hero sits on a dark background, so the navbar starts
 *   transparent/light-on-dark and becomes solid white once scrolled past
 *   the hero.
 * - Science is dark throughout, so the navbar stays transparent/light the
 *   whole page (it blends into the dark background rather than floating
 *   a white bar over it).
 * - Every other route (Tricora, About, Contact) has a light top section,
 *   so the navbar is solid immediately.
 */
export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Mobile menu accessibility: move focus in on open, trap Tab/Shift+Tab
  // within the panel, close on Escape, and return focus to the trigger
  // button on close — all without altering the existing visual behavior.
  useEffect(() => {
    if (!menuOpen) return;
    const triggerEl = menuTriggerRef.current;

    const panel = menuPanelRef.current;
    const getFocusable = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
        : [];

    const focusables = getFocusable();
    (focusables[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerEl?.focus();
    };
  }, [menuOpen]);

  const isHome = pathname === "/";
  const isScience = pathname === "/science";
  const solid = isScience ? false : isHome ? scrolled : true;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[100] transition-[background-color,border-color,padding] duration-200 ${
          solid ? "bg-white/95 backdrop-blur border-b border-border py-3.5" : "py-5"
        }`}
      >
        <div className="max-w-container mx-auto px-6 md:px-8 flex items-center justify-between">
          <Link href="/" aria-label="Vortex BioPharma — Home">
            <Logo variant={solid ? "full-light" : "full-dark"} priority className={solid ? "h-6" : "h-7"} />
          </Link>

          <div className="hidden md:flex items-center gap-10">
            {navigation
              .filter((item) => item.inNav)
              .map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium relative py-1 transition-colors ${
                      solid ? "text-text-primary" : "text-text-primary-inverse"
                    } hover:text-accent-solid ${active ? "after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-accent-solid" : ""}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </div>

          <div className="flex items-center gap-5">
            <Button href={primaryCta.href} variant="primary" onDark={!solid} className="hidden md:inline-flex !py-2.5 !px-5 !text-sm">
              {primaryCta.label}
            </Button>
            <button
              ref={menuTriggerRef}
              className="md:hidden p-2"
              aria-label="Open menu"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <line x1="3" y1="6" x2="21" y2="6" stroke={solid ? "#0B1220" : "#F7F9FC"} strokeWidth="1.6" />
                <line x1="3" y1="12" x2="21" y2="12" stroke={solid ? "#0B1220" : "#F7F9FC"} strokeWidth="1.6" />
                <line x1="3" y1="18" x2="21" y2="18" stroke={solid ? "#0B1220" : "#F7F9FC"} strokeWidth="1.6" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div
          ref={menuPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          tabIndex={-1}
          className="fixed inset-0 z-[200] bg-bg-inverse flex flex-col px-6 py-6 outline-none"
        >
          <div className="flex items-center justify-between">
            <Logo variant="full-dark" className="h-6" />
            <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="text-text-primary-inverse text-3xl leading-none p-2">
              &times;
            </button>
          </div>
          <div className="mt-14 flex flex-col gap-7">
            {navigation
              .filter((item) => item.inNav)
              .map((item) => (
                <Link key={item.href} href={item.href} className="font-display text-3xl font-normal text-text-primary-inverse">
                  {item.label}
                </Link>
              ))}
          </div>
          <div className="mt-auto">
            <Button href={primaryCta.href} variant="primary" onDark className="w-full">
              {primaryCta.label}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
