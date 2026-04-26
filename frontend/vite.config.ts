import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // Permite accesul din exteriorul containerului
    allowedHosts: ['cine406.go.ro'], // Autorizează domeniul tău Digi
    port: 5173,
    strictPort: false, // Dacă e ocupat, încearcă automat un port liber
    watch: {
      usePolling: true, // Necesar în Docker pe Windows/macOS, dar bun de siguranță și pe Linux
    },
  },
})
