import type { Metadata } from "next";
import "./globals.css";
import { robotsDirective, siteMeta } from "@/content/site-meta";
import { Navbar } from "@/components/navigation/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: siteMeta.home.title,
  description: siteMeta.home.description,
  robots: robotsDirective,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Fonts are loaded via a standard <link> tag rather than
          next/font/google: next/font fetches and self-hosts the font
          files at *build time*, which requires build-time network access
          to fonts.googleapis.com/fonts.gstatic.com. This sandboxed build
          environment's network allowlist doesn't include those domains,
          so next/font fails here. In a normal deployment environment
          (e.g. Vercel), swapping this back to next/font/google is a
          drop-in change and is the recommended production approach for
          performance (self-hosted, no render-blocking request).
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, border: "1px solid #dcc3a2", borderRadius: 999, padding: "8px 14px", background: "#fffaf4", color: "#604629", fontSize: 12, fontWeight: 700, boxShadow: "0 8px 24px #17203322" }}>DEMO PREVIEW</div>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
