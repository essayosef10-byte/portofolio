// Brand/company content model for the reserved /about and /contact routes.
//
// Nothing here is fabricated. Every field is either null (no approved
// content yet) or a value sourced directly from the physical packaging.
// Components must treat `approved: false` as "do not render" — never as
// an invitation to fill the gap with placeholder copy.

export const brand = {
  name: "Vortex BioPharma",

  about: {
    intro: null as string | null,
    mission: null as string | null,
    facilities: null as string | null,
    certifications: null as string | null,
    team: [] as { name: string; role: string }[],
  },

  contact: {
    approved: false, // candidate values below are packaging-sourced, not yet approved for publication
    candidate: {
      company: "Vortex BioPharma",
      city: "Cairo, Egypt",
      website: "www.vortexbiopharma.com",
    },
    email: null as string | null,
    phone: null as string | null,
    social: [] as { platform: string; url: string }[],
  },
};

export type Brand = typeof brand;
