import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#FFFFFF",
          secondary: "#F5F7FA",
          inverse: "#03112B",
        },
        surface: {
          inverse: "#0B1C3D",
        },
        text: {
          primary: "#0B1220",
          "primary-inverse": "#F7F9FC",
          secondary: "#4A5568",
          "secondary-inverse": "#B8C2D0",
          muted: "#8A94A6",
        },
        accent: {
          solid: "#2555D9",
          "solid-hover": "#1E46BD",
          grad1: "#1E3FE0",
          grad2: "#6FC7FF",
        },
        border: {
          DEFAULT: "#E2E6EC",
          inverse: "#22304A",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      maxWidth: {
        container: "1280px",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
