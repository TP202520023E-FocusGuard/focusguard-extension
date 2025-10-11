import { readFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const nodeEnv = mode === 'development' ? 'development' : 'production'

  return {
    plugins: [
      vue(),
      vueDevTools(),
      {
        name: 'focusguard-copy-extension-assets',
        apply: 'build',
        generateBundle() {
          const extensionRoot = fileURLToPath(new URL('./extension', import.meta.url))
          const filesToCopy = ['manifest.json', 'popup.html', 'popup.css']

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
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },
    build: {
      outDir: 'dist-extension',
      emptyOutDir: true,
      cssCodeSplit: false,
      lib: {
        entry: {
          popup: fileURLToPath(new URL('./extension/popup.js', import.meta.url)),
          content: fileURLToPath(new URL('./extension/content.js', import.meta.url)),
        },
        formats: ['es'],
      },
      rollupOptions: {
        plugins: [
          {
            name: 'focusguard-process-shim',
            renderChunk(code) {
              if (!code.includes('process.')) {
                return null
              }

              const shim = `const process = globalThis.process ?? { env: { NODE_ENV: ${JSON.stringify(nodeEnv)} } };\n`

              return {
                code: `${shim}${code}`,
                map: null,
              }
            },
          },
        ],
        external: [],
        output: {
          entryFileNames: ({ name }) => {
            if (name === 'popup') {
              return 'popup.js'
            }

            if (name === 'content') {
              return 'content.js'
            }

            return 'assets/[name].js'
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (!assetInfo.name) {
              return 'assets/[name][extname]'
            }

            const assetBaseName = basename(assetInfo.name)

            if (assetBaseName.endsWith('.css')) {
              if (assetBaseName === 'popup.css') {
                return 'popup.css'
              }

              if (assetBaseName === 'content.css') {
                return 'content.css'
              }

              return `assets/${assetBaseName}`
            }

            return `assets/${assetBaseName}`
          },
        },
      },
    },
  }
})
