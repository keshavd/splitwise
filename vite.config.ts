import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/splitwise/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
  },
}))
