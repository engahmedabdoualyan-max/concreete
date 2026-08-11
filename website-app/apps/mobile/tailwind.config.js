/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        fimto: {
          orange: "#F97316",
          navy: "#0F172A",
          slate: {
            50: "#F8FAFC",
            100: "#F1F5F9",
            200: "#E2E8F0",
            300: "#CBD5E1",
            400: "#94A3B8",
            500: "#64748B",
            600: "#475569",
            700: "#334155",
            800: "#1E293B",
            900: "#0F172A",
            950: "#020617",
          },
        },
        status: {
          pending: "#F97316",
          approved: "#10B981",
          transit: "#3B82F6",
          delivered: "#059669",
          rejected: "#EF4444",
          credit_hold: "#D97706",
        },
      },
      fontFamily: {
        arabic: ["System"],
      },
    },
  },
  plugins: [],
};
