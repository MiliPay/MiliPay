/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
        "tick-in": {
          "0%": { opacity: "0", transform: "translateX(8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "ring-pulse": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
        "scan-sweep": {
          "0%": { top: "6px" },
          "50%": { top: "calc(100% - 6px)" },
          "100%": { top: "6px" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "tick-in": "tick-in 0.4s ease-out",
        "ring-pulse": "ring-pulse 2.2s ease-out infinite",
        "scan-sweep": "scan-sweep 1.1s linear infinite",
        "rise-in": "rise-in 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
