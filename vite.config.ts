import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace 'fractalflow' with your actual repo name if different
export default defineConfig({
  base: '/fractalflow/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
})
