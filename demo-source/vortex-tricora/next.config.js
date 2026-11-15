/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Product/brand imagery is served from /public as static assets.
    unoptimized: true,
  },
  // Fonts are loaded via a plain <link> tag in app/layout.tsx (see comment
  // there for why). Next's automatic font optimization otherwise tries to
  // fetch fonts.googleapis.com at *build time* to inline/minify the
  // stylesheet, which fails in network-restricted build environments.
  // Disabling it here just skips that build-time inlining step — fonts
  // still load normally in the browser at runtime either way.
  optimizeFonts: false,
};
module.exports = nextConfig;
