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
    host: true,
    allowedHosts: ['cine406.go.ro'],
    port: 5173,
    strictPort: false,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
