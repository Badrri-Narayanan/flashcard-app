import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
        },
      },
      keyframes: {
        'card-in-next': {
          from: { opacity: '0', transform: 'translateX(45%) rotate(6deg) scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        'card-in-prev': {
          from: { opacity: '0', transform: 'translateX(-45%) rotate(-6deg) scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'card-in-next': 'card-in-next 340ms cubic-bezier(0.22, 1, 0.36, 1)',
        'card-in-prev': 'card-in-prev 340ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
