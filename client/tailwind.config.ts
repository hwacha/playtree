import type { Config } from 'tailwindcss'

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        lilitaOne: ['LilitaOne', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
