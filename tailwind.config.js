/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // GitHub-dark style technical palette per spec
        base: '#0d1117',
        panel: '#161b22',
        panel2: '#1c2128',
        edge: '#30363d',
        accent: '#00d9ff',
        ok: '#3fb950',
        warn: '#d29922',
        err: '#f85149',
        dim: '#8b949e',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
        ui: ['"Inter"', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        xxs: '10px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};
