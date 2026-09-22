/** @type {import('tailwindcss').Config} */

// The colour vocabulary here is deliberately identical to the one the four
// portals share (AdminPanel/tailwind.config.js). Before this, mobile used the
// stock Tailwind palette — emerald-500 for the brand, slate for light surfaces,
// zinc for dark ones — which meant the customer app was a different brand from
// the staff tools, and carried light and dark surfaces inside the same screen.
module.exports = {
  darkMode: 'class',
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Surfaces, darkest to lightest. `ledger` is the page; `raised` is a
        // card on it; `line` and `line2` are its borders.
        ledger: {
          DEFAULT: "#080C0A",
          raised: "#0A1F1A",
          line: "#1A3A30",
          line2: "#234539",
        },
        // The brand green. `signal` is the action colour — buttons, active
        // states, the amount that matters. `ink` is what sits on top of it.
        signal: {
          DEFAULT: "#00C896",
          bright: "#33E0B5",
          dim: "#0A6650",
          ink: "#04120E",
        },
        // Text, in descending importance. Nothing should be dimmer than faint.
        ink: {
          DEFAULT: "#E8FFF6",
          muted: "#86B3A4",
          faint: "#4F7568",
        },
        // Reserved for state, never for decoration. If a colour here appears on
        // something that is not reporting a state, it is the wrong colour.
        status: {
          ok: "#33E0B5",
          info: "#3B82F6",
          warn: "#FFB454",
          fail: "#FF5C5C",
        },
      },
      fontFamily: {
        inter: ['Inter_400Regular', 'sans-serif'],
        'inter-medium': ['Inter_500Medium', 'sans-serif'],
        'inter-semibold': ['Inter_600SemiBold', 'sans-serif'],
        'inter-bold': ['Inter_700Bold', 'sans-serif'],
        // `font-inter-black` was used in five places and defined in none of
        // them, so it resolved to nothing. Inter_900Black is not loaded in
        // App.tsx either; bold is the heaviest weight the app actually has.
        mono: ['SpaceMono_400Regular', 'monospace'],
        'mono-bold': ['SpaceMono_700Bold', 'monospace'],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
      },
    },
  },
  plugins: [],
}
