import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1917",
        paper: "#faf7f2",
        safe: { DEFAULT: "#15803d", soft: "#dcfce7", line: "#86efac" },
        careful: { DEFAULT: "#b45309", soft: "#fef3c7", line: "#fcd34d" },
        danger: { DEFAULT: "#b91c1c", soft: "#fee2e2", line: "#fca5a5" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Noto Sans",
          "Noto Nastaliq Urdu",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
