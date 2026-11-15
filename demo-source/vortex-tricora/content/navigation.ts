export type NavItem = {
  label: string;
  href: string;
  inNav: boolean; // whether it currently appears in the public navbar
};

// Public nav is locked to Home / Tricora / Science. About and Contact
// routes exist (see app/about, app/contact) but are excluded from the
// visible nav until each has approved content — flip `inNav` when ready.
export const navigation: NavItem[] = [
  { label: "Home", href: "/", inNav: true },
  { label: "Tricora", href: "/tricora", inNav: true },
  { label: "Science", href: "/science", inNav: true },
  { label: "About", href: "/about", inNav: false },
  { label: "Contact", href: "/contact", inNav: false },
];

export const primaryCta = { label: "Discover Tricora", href: "/tricora" };
export const secondaryCta = { label: "Explore the Science", href: "/science" };

// Reserved for future e-commerce activation — not rendered anywhere yet.
export const futureNavigation: NavItem[] = [
  { label: "Shop", href: "/shop", inNav: false },
  { label: "Cart", href: "/cart", inNav: false },
  { label: "Account", href: "/account", inNav: false },
];
