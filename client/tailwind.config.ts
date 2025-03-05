import type { Config } from 'tailwindcss'

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        lilitaOne: ['LilitaOne', 'sans-serif'],
        markazi: ['MarkaziText', 'serif']
      },
    },
  },
  plugins: [],
  safelist: [
    {
      pattern: /(bg|text|border|color)-(red|green|blue|orange|amber)-(100|200|300|400|500|600|700)|opacity-(50|100)|z-*/, // You can display all the colors that you need
      // variants: ['lg', 'hover', 'focus', 'lg:hover'],      // Optional
    }
  ],
} satisfies Config
