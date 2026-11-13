/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
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
        }
      }
    },
  },
  plugins: [],
}

