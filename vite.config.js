import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ethers v6 is pure ESM and ships browser-ready builds, so none of the
// Node polyfills (process/browser, stream-browserify, util) that ethers v5
// required are needed here.
export default defineConfig({
  plugins: [react()],
  server: {
    // Expose the dev server on the LAN so a phone can scan a generated QR code
    // and reach the verification page during a demo.
    host: true
  }
})
