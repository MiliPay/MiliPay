/** @type {import('tailwindcss').Config} */
// Tokens from the website design handoff (design_handoff_website/README.md).
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        brand: { DEFAULT: "#00C896", hover: "#33E0B5", on: "#04120E", text: "#0A6650" },
        deep: { 1: "#0a7a5a", 2: "#065f46", 3: "#022c22" },
        ink: { DEFAULT: "#0B1A15", muted: "#56695F", faint: "#8A9C95" },
        soft: "#F2F5F4",
        field: "#F8FAF9",
        line: { DEFAULT: "#E3EAE7", 2: "#E9EFEC", 3: "#EEF2F0" },
        night: "#04120E",
        danger: "#D2383E",
      },
      maxWidth: { site: "1240px" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "none" } },
        ringPulse: { "0%": { transform: "scale(.96)", opacity: ".7" }, "100%": { transform: "scale(1.08)", opacity: "0" } },
      },
      animation: {
        rise: "rise .6s cubic-bezier(.2,.8,.2,1) both",
        "rise-late": "rise .6s .4s cubic-bezier(.2,.8,.2,1) both",
        "rise-fast": "rise .4s both",
        "rise-short": "rise .25s",
        ring: "ringPulse 2.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
