/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1a1a1a",
        accent: "#E8B455",
        copper: "#C49830",
        "btn-bg": "#0A7A9A",
        "page-bg": "#FDFAF3",
        warmbg: "#faf8f5",
        whatsapp: "#25d366",
        "like-red": "#c32323",
      },
      fontFamily: {
        playfair: ["Playfair Display", "serif"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
