/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The Heartfulness blue — the spine of the brand.
        brand: {
          50: '#f6f8fc',
          100: '#e9eef7',
          200: '#d4dded',
          300: '#b0c0dd',
          400: '#879bc6',
          500: '#6579ac',
          600: '#45598f', // primary — the colour of the logo
          700: '#394a77',
          800: '#2e3c60',
          900: '#252f4a',
        },
        // Warm light — used sparingly for highlights, like a diya.
        gold: {
          100: '#f8f2e6',
          200: '#eee0c1',
          400: '#cfb079',
          500: '#bd9a5e',
          600: '#8d6f39',
        },
        ink: {
          900: '#1e2438',
          700: '#3f4760',
          500: '#6b7389',
          400: '#7f889f',
        },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Barely-there lift; the layout should read as paper, not as chrome.
        soft: '0 1px 2px rgba(30, 36, 56, 0.03), 0 6px 20px rgba(30, 36, 56, 0.05)',
        lift: '0 10px 30px rgba(30, 36, 56, 0.10)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.75' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        breathe: 'breathe 5s ease-in-out infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}
