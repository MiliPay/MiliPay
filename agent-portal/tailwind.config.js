/** @type {import('tailwindcss').Config} */
import preset from "../packages/shared/tailwind.preset.js";

export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [],
};
