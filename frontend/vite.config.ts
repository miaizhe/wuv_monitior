import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('socket.io-client')) return 'vendor-socket';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
