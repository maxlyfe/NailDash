import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nd: {
          bg: '#FDF8F3',
          surface: '#FAF3EB',
          card: '#FFFFFF',
          border: '#E8DDD0',
          'border-glow': '#D4C4B0',
          muted: '#A09585',
          text: '#4A3F35',
          heading: '#2D2520',
          accent: '#C8956C',
          'accent-dim': '#A07550',
          highlight: '#E8B4A0',
          'highlight-dim': '#C48A70',
          success: '#7EB89C',
          warning: '#D4A853',
          danger: '#D4756A',
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(45, 37, 32, 0.06), 0 4px 16px -4px rgba(45, 37, 32, 0.04)',
        'soft-lg': '0 4px 16px -4px rgba(45, 37, 32, 0.08), 0 8px 32px -8px rgba(45, 37, 32, 0.06)',
        'soft-xl': '0 8px 24px -6px rgba(45, 37, 32, 0.1), 0 16px 48px -12px rgba(45, 37, 32, 0.08)',
        'glow': '0 0 20px -4px rgba(200, 149, 108, 0.15)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(45, 37, 32, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
