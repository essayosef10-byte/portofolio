// Product content model.
//
// Fields are only rendered by components when explicitly marked
// `publiclyVisible: true` (or have no such flag, meaning they're safe
// baseline info). This keeps restricted data — formulation percentages,
// registration numbers — structurally present for future use, without
// ever reaching the public UI until a real, approved value replaces the
// placeholder and the flag is flipped.

export const product = {
  brand: "Vortex BioPharma",
  name: "Vortex Tricora",
  type: "Scalp Serum",
  category: "Advanced Scalp Serum",
  size: "50ml (1.69 fl.oz)",
  formulaName: "with ZnO Nanoparticles & mDHT Complex",
  externalUseOnly: "For external use only",

  usageSteps: [
    {
      title: "Apply",
      body: "Apply the serum to the scalp.",
    },
    {
      title: "Massage",
      body: "Massage the product into the scalp for approximately 5 minutes.",
    },
    {
      title: "Focus",
      body: "Focus on the primary hairline and surrounding scalp areas.",
    },
    {
      title: "Repeat, twice daily",
      body: "Use once in the morning and once at night. Duration of use is open-ended.",
    },
  ],

  cautions: [
    "Avoid contact with eyes.",
    "In case of contact, rinse thoroughly with water.",
    "Discontinue use if irritation occurs.",
    "Keep out of reach of children.",
    "For adult use only.",
  ],

  storage: [
    "Store below 30°C.",
    "Keep away from direct sunlight.",
    "Close the cap tightly after use.",
    // Deliberately no shelf-life duration line: the packaging's 12M icon is
    // a period-after-opening symbol, not a confirmed total shelf-life
    // statement, and shouldn't be inferred into one.
  ],

  // Restricted / not-yet-approved data. Present for future development,
  // never rendered publicly at this phase.
  formulation: {
    publiclyVisible: false,
    items: [
      { name: "ZnO Nanoparticles (Zinc Oxide)", value: "2.0%" },
      { name: "mDHT Complex", value: "2.0%" },
      { name: "Caffeine", value: "2.0%" },
      { name: "Biotin", value: "0.1%" },
      { name: "Niacinamide", value: "2.0%" },
      { name: "Panthenol (Pro-Vitamin B5)", value: "1.0%" },
      { name: "Folic Acid", value: "0.1%" },
    ],
  },

  regulatory: {
    publiclyVisible: false,
    registrationNumber: null as string | null,
  },

  trustBadges: {
    publiclyVisible: false, // GMP / origin marks pending confirmation
  },

  purchase: {
    // Reserved shape for future e-commerce activation. Unset by design.
    priceCents: null as number | null,
    currency: null as string | null,
    sku: null as string | null,
    stock: null as number | null,
    available: false,
  },
};

export type Product = typeof product;
