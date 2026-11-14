/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          red: '#C92A2A',
          'red-hover': '#A61E1E',
          blue: '#2563EB',
          green: '#10B981',
          teal: '#06B6D4',
          purple: '#6366F1',
          dark: '#0B0F19',
          card: '#161F30',
          border: '#243247'
        },
        surface: 'var(--bg-base)',
        panel: 'var(--bg-panel)',
        raised: 'var(--bg-raised)',
        'border-subtle': 'var(--border-subtle)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
      }
    },
  },
  plugins: [],
}

