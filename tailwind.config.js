/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm teal — the spine of the brand
        brand: {
          50: '#f0fdfa',
          100: '#d7f5ef',
          200: '#aee9df',
          300: '#79d6c8',
          400: '#43bbac',
          500: '#1f9e90',
          600: '#0f766e', // primary
          700: '#0c5f59',
          800: '#0d4d49',
          900: '#0e403d',
        },
        // Warm light — used sparingly for highlights, like a diya
        gold: {
          100: '#f7eed8',
          200: '#ecd9a8',
          400: '#d4ad5e',
          500: '#c8a04d',
          600: '#a9853a',
        },
        ink: {
          900: '#16302e',
          700: '#334b48',
          500: '#5d736f',
          400: '#8a9b97',
        },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 48, 46, 0.04), 0 8px 24px rgba(16, 48, 46, 0.06)',
        lift: '0 8px 30px rgba(16, 48, 46, 0.12)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
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
