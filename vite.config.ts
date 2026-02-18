import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const devPort = 5173
const tauriDevHost = process.env.TAURI_DEV_HOST
const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/',
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@app': resolve(currentDir, 'src/app'),
      '@features': resolve(currentDir, 'src/features'),
      '@shared': resolve(currentDir, 'src/shared'),
      '@lib': resolve(currentDir, 'src/lib'),
      '@runtime': resolve(currentDir, 'src/shared/runtime'),
      '@platform': resolve(currentDir, 'src/platform'),
    },
  },
  server: {
    port: devPort,
    strictPort: true,
    host: tauriDevHost || false,
    hmr: tauriDevHost
      ? {
          protocol: 'ws',
          host: tauriDevHost,
          port: devPort,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/@remix-run/router/')
          ) {
            return 'vendor-react'
          }
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons'
          }
          if (id.includes('/@tauri-apps/')) {
            return 'vendor-tauri'
          }
          // Let Rollup place remaining deps to avoid cross-vendor cycles.
          return
        },
      },
    },
  },
})
