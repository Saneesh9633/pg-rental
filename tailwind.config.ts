import type { Config } from "tailwindcss";

/**
 * Theme: warm beige canvas, white cards, deep teal/sage accent, soft pastel tints.
 * `indigo` is deliberately remapped to the brand teal and `gray` to a warm neutral, so every
 * existing utility (bg-indigo-600, text-gray-500 …) follows the new theme from one place.
 */
const config: Config = {
  content: ["./pages/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      colors: {
        canvas: "#EFEEE8",
        brand: { 50: "#EEF8F5", 100: "#D8EFE8", 200: "#B2DFD2", 300: "#82C8B7", 400: "#4DAB97", 500: "#24907A", 600: "#167A66", 700: "#126254", 800: "#0F4E43", 900: "#0B3A32" },
        indigo: { 50: "#EEF8F5", 100: "#D8EFE8", 200: "#B2DFD2", 300: "#82C8B7", 400: "#4DAB97", 500: "#24907A", 600: "#167A66", 700: "#126254", 800: "#0F4E43", 900: "#0B3A32" },
        gray: { 50: "#F8F7F3", 100: "#F1F0EA", 200: "#E6E4DC", 300: "#D3D1C7", 400: "#A19F94", 500: "#77756A", 600: "#5A5850", 700: "#42413A", 800: "#2A2B27", 900: "#141B18" },
        tint: { mint: "#E3F3EA", peach: "#FCEBDD", lilac: "#ECEAFB", sky: "#E4EEFB", butter: "#FBF1CF", blush: "#FBE4E0" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,27,24,0.04), 0 12px 32px -16px rgba(20,27,24,0.14)",
        lift: "0 2px 4px rgba(20,27,24,0.05), 0 18px 40px -18px rgba(20,27,24,0.22)",
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
export default config;
