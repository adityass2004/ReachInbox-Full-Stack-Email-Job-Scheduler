import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4AA34C",
          hover: "#3E8B3F",
          soft: "#E8F5ED",
        },
        surface: {
          canvas: "#FFFFFF",
          input: "#F5F7F5",
          border: "#E5E7E5",
          outer: "#1E1E1E",
        },
        ink: {
          primary: "#202020",
          secondary: "#7A7A7A",
          muted: "#9E9E9E",
        },
        highlight: {
          yellow: "#FEFCEA",
          yellowBorder: "#F3E488",
          orangeBadge: "#FDF4EC",
          orangeText: "#B85D19",
        },
        brand: {
          50: "#eef3ed",
          100: "#dce8dc",
          500: "#4AA34C",
          600: "#3E8B3F",
          700: "#183c31",
        },
      },
    },
  },
  plugins: [],
};

export default config;
