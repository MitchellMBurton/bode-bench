import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const tauriHost = process.env.TAURI_DEV_HOST
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const isTauriBuild = typeof tauriPlatform === 'string' && tauriPlatform.length > 0

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    host: tauriHost || undefined,
    port: 5173,
    strictPort: true,
    hmr: tauriHost
      ? {
          protocol: 'ws',
          host: tauriHost,
          port: 5174,
        }
      : undefined,
  },
  build: isTauriBuild
    ? {
        target: tauriPlatform === 'windows' ? 'chrome105' : 'safari13',
        minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
      }
    : undefined,
})
