export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#effaf1',
          100: '#d9f2df',
          200: '#b9e9c5',
          300: '#9be7b1',
          400: '#7bd596',
          500: '#5dbb7b',
          600: '#42975f',
          700: '#34774c',
          800: '#285e3c',
          900: '#1d472e',
        },
        secondary: {
          50: '#effbf8',
          100: '#d7f4ec',
          200: '#b3eada',
          300: '#91dfc8',
          400: '#73d7bd',
          500: '#54bda3',
          600: '#3f9983',
          700: '#337b6c',
          800: '#286255',
          900: '#1e4b41',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#06b6d4',
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Manrope', 'sans-serif'],
      },
      spacing: {
        128: '32rem',
        144: '36rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 15px rgba(155, 231, 177, 0.24)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
