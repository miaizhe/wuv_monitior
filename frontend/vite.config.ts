import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'recharts', 'lucide-react', 'socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
