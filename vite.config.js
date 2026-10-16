import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const iconPath = resolve(process.cwd(), 'nexora-browser.ico')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-root-browser-icon',
      closeBundle() {
        copyFileSync(iconPath, resolve(process.cwd(), 'dist', 'nexora-browser.ico'))
      },
    },
  ],
  base: './',
  server: {
    watch: {
      ignored: ['**/build/**'],
    },
  },
})
