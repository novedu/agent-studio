import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--studio-text)',
        muted: 'var(--studio-text-muted)',
        panel: 'var(--studio-surface-muted)',
        surface: 'var(--studio-surface)',
        line: 'var(--studio-border)',
        lineStrong: 'var(--studio-border-strong)',
        accent: 'var(--studio-primary)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [typography],
} satisfies Config;
