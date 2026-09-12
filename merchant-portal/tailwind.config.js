/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/shared/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ledger: {
          DEFAULT: "#080C0A",
          raised: "#0A1F1A",
          line: "#1A3A30",
          line2: "#234539",
        },
        signal: {
          DEFAULT: "#00C896",
          bright: "#33E0B5",
          dim: "#0A6650",
          ink: "#04120E",
        },
        ink: {
          DEFAULT: "#E8FFF6",
          muted: "#86B3A4",
          faint: "#4F7568",
        },
        status: {
          ok: "#33E0B5",
          info: "#3B82F6",
          warn: "#FFB454",
          fail: "#FF5C5C",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        data: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [],
};
