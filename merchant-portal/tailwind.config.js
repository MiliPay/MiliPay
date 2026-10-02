/** @type {import('tailwindcss').Config} */
import preset from "../packages/shared/tailwind.preset.js";

// The merchant portal has not been redesigned yet: it stays on the dark theme
// (data-theme="dark" in index.html), where the legacy colour names keep their
// original values.
export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [],
};
