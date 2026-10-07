/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FFF8F2',
          100: '#FFE8CC',
          200: '#FFD199',
          300: '#FFB347',
          400: '#F78C25',
          500: '#e07010',
          600: '#c45e00',
          700: '#a34e00',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
