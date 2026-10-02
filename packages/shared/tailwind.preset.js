/**
 * The portals' shared Tailwind tokens (design handoff "MiliPay Admin" /
 * "MiliPay Support"). Every colour reads a CSS variable from
 * `src/styles/index.css`, which flips between the light and dark theme with
 * `data-theme` on <html>.
 *
 * Two families live here:
 *
 * - The design's own tokens: canvas, panel, side, line, line2, chip, field,
 *   hover, fg, muted, faint, brand, brand-text, the soft tints and the three
 *   tones. New screens use only these.
 * - The older ledger / ink / signal / status names, kept so screens not yet
 *   rebuilt still read in both themes. Their dark values are unchanged.
 *   `white` is remapped too: on the old screens it means "a tint of the
 *   foreground" (white/[0.03] backgrounds, white/[0.05] borders, text-white),
 *   which in the light theme has to be a tint of dark ink instead. New code
 *   writes #fff explicitly when it means white. Once every screen is rebuilt
 *   the legacy names and the white remap can go.
 */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        canvas: channel("bg"),
        panel: channel("panel"),
        side: channel("side"),
        line: channel("line"),
        line2: channel("line2"),
        chip: channel("chip"),
        field: channel("input"),
        hover: channel("hover"),
        fg: channel("text"),
        muted: channel("muted"),
        faint: channel("faint"),
        brand: {
          DEFAULT: channel("brand"),
          text: channel("brand-text"),
          soft: "var(--brand-soft)",
          ink: "#04120E",
        },
        warn: { DEFAULT: channel("warn"), soft: "var(--warn-soft)" },
        fail: { DEFAULT: channel("fail"), soft: "var(--fail-soft)" },
        info: { DEFAULT: channel("info"), soft: "var(--info-soft)" },
        scrim: "var(--scrim)",

        white: channel("overlay"),
        ledger: {
          DEFAULT: channel("legacy-ledger"),
          raised: channel("legacy-raised"),
          line: channel("legacy-line"),
          line2: channel("legacy-line2"),
        },
        signal: {
          DEFAULT: channel("brand"),
          bright: channel("brand-text"),
          dim: "#0A6650",
          ink: "#04120E",
        },
        ink: {
          DEFAULT: channel("text"),
          muted: channel("muted"),
          faint: channel("legacy-faint"),
        },
        status: {
          ok: channel("brand-text"),
          info: channel("legacy-info"),
          warn: channel("warn"),
          fail: channel("fail"),
        },
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        data: ["IBM Plex Mono", "ui-monospace", "monospace"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        card: "18px",
      },
      boxShadow: {
        card: "var(--shadow)",
        pop: "0 16px 40px rgba(0,0,0,.18)",
        modal: "0 30px 80px rgba(0,0,0,.25)",
      },
      keyframes: {
        "tick-in": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "none" },
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
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "drawer-in": {
          from: { transform: "translateX(40px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        "pulse-dot": {
          "0%": { boxShadow: "0 0 0 0 rgba(0,200,150,.5)" },
          "100%": { boxShadow: "0 0 0 8px rgba(0,200,150,0)" },
        },
        "pulse-red": { "0%,100%": { opacity: "1" }, "50%": { opacity: ".55" } },
        heartbeat: {
          "0%,100%": { transform: "scale(1)" },
          "14%": { transform: "scale(1.14)" },
          "28%": { transform: "scale(1)" },
          "42%": { transform: "scale(1.09)" },
          "70%": { transform: "scale(1)" },
        },
        typing: { "0%,60%,100%": { opacity: ".25" }, "30%": { opacity: "1" } },
      },
      animation: {
        "tick-in": "tick-in 0.4s ease-out",
        "ring-pulse": "ring-pulse 2.2s ease-out infinite",
        "scan-sweep": "scan-sweep 1.1s linear infinite",
        "rise-in": "rise-in 0.25s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
        "drawer-in": "drawer-in 0.28s cubic-bezier(.2,.8,.2,1)",
        "pulse-dot": "pulse-dot 1.6s infinite",
        "pulse-red": "pulse-red 1.4s infinite",
        heartbeat: "heartbeat 1.3s ease-in-out infinite",
        typing: "typing 1.2s infinite",
      },
    },
  },
};
