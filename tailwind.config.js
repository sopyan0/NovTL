
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}", 
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./constants/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        // Menggunakan CSS Variables dengan format RGB untuk mendukung opacity modifier di Tailwind
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        charcoal: 'rgb(var(--color-charcoal) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)', 
        border: 'rgb(var(--color-border) / <alpha-value>)', 
        accent: '#6C5CE7',
        accentHover: '#4834d4',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      boxShadow: {
        'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
        'inner-light': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(108, 92, 231, 0.2)'
      }
    },
  },
  plugins: [],
}
