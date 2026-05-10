import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        office: {
          wall: '#EDE8DC',
          floor: '#C4956A',
          navy: '#2C3E6B',
          brass: '#F0C070',
        },
        lamp: {
          idle: '#FFB84D',
          working: '#4D7FFF',
          done: '#4DFFA0',
          blocked: '#FF6B4D',
        },
        panel: {
          bg: 'rgba(18,23,43,0.92)',
          text: '#FFFFFF',
          muted: '#8892B0',
          accent: '#4D7FFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
