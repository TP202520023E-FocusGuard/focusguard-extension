import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    {
      name: 'focusguard-copy-extension-assets',
      apply: 'build',
      generateBundle() {
        const extensionRoot = fileURLToPath(new URL('./extension', import.meta.url))
        const filesToCopy = ['manifest.json', 'content.js']

        for (const fileName of filesToCopy) {
          const filePath = resolve(extensionRoot, fileName)

          if (!existsSync(filePath)) {
            continue
          }

          const source = readFileSync(filePath)
          this.emitFile({
            type: 'asset',
            fileName,
            source,
          })
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('./extension/popup.html', import.meta.url)),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: ({ name }) => {
          if (!name) {
            return 'assets/[name][extname]'
          }

          if (name.endsWith('.css')) {
            return 'assets/[name]'
          }

          return 'assets/[name][extname]'
        },
      },
    },
  },
})
