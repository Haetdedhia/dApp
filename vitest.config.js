import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Kept separate from vite.config.js so the dev/build config stays free of test
// concerns, and so `npm run build` never pulls in jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.jsx']
  }
})
