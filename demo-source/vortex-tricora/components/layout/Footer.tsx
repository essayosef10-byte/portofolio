import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { navigation } from "@/content/navigation";

export function Footer() {
  return (
    <footer className="bg-bg-inverse text-text-secondary-inverse pt-16 pb-10">
      <div className="max-w-container mx-auto px-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-8 pb-10 border-b border-border-inverse">
          <Logo variant="full-dark" className="h-6" />
          <div className="flex gap-8 flex-wrap">
            {navigation
              .filter((item) => item.inNav)
              .map((item) => (
                <Link key={item.href} href={item.href} className="text-sm hover:text-white transition-colors">
                  {item.label}
                </Link>
              ))}
          </div>
        </div>
        <div className="pt-7 flex flex-wrap justify-between gap-3 text-[13px] text-text-muted">
          <span>© {new Date().getFullYear()} Vortex BioPharma. All rights reserved.</span>
          <span>Pre-launch preview — not currently available for purchase.</span>
        </div>
      </div>
    </footer>
  );
}
