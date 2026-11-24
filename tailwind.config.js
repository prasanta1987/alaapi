/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans Bengali"', 'sans-serif'],
        bengali: ['"Noto Sans Bengali"', 'sans-serif'],
      },
      screens: {
        'xs': '480px',
      }
    },
  },
  plugins: [],
}

