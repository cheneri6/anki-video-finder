import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Professional Vite configuration for modern React environments
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})