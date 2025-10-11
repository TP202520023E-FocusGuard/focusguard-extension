import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const extensionRoot = fileURLToPath(new URL('./extension', import.meta.url))
const BUNDLED_FILES = new Set(['popup.html', 'popup.js', 'content.js'])

async function copyDirectory(
  source: string,
  destination: string,
  ignoredEntries: Set<string>,
): Promise<void> {
  await fs.mkdir(destination, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })

  await Promise.all(entries.map(async (entry) => {
    if (ignoredEntries.has(entry.name)) {
      return
    }

    const sourcePath = path.resolve(source, entry.name)
    const destinationPath = path.resolve(destination, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath, ignoredEntries)
      return
    }

    await fs.copyFile(sourcePath, destinationPath)
  }))
}

function chromeExtensionOutputPlugin() {
  let resolvedOutDir = ''

  return {
    name: 'focusguard-chrome-extension-output',
    apply: 'build' as const,
    configResolved(config) {
      resolvedOutDir = config.build.outDir
    },
    async closeBundle() {
      if (!resolvedOutDir) {
        return
      }

      await copyDirectory(extensionRoot, resolvedOutDir, BUNDLED_FILES)
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    chromeExtensionOutputPlugin(),
  ],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    target: 'chrome114',
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: path.resolve(extensionRoot, 'popup.html'),
        content: path.resolve(extensionRoot, 'content.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'https://unpkg.com/vue@3/dist/vue.esm-browser.js': 'vue',
    },
  },
  optimizeDeps: {
    entries: [path.resolve(extensionRoot, 'popup.html')],
  },
})
