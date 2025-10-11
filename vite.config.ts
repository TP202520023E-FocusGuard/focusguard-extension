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
          {
            name: 'focusguard-inline-content-imports',
            apply: 'build',
            generateBundle(_options, bundle) {
              const extensionRoot = fileURLToPath(new URL('./extension', import.meta.url))
              const contentEntryId = resolve(extensionRoot, 'content.js')

              const escapeRegex = (value: string) => value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')

              const convertExportsToAssignments = (chunkCode: string) => {
                return chunkCode
                  .replace(/export\s+default\s+([A-Za-z0-9_$]+)/g, 'const __default__ = $1;')
                  .replace(/export\s+default\s*(?=function|class)/g, '')
                  .replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ')
                  .replace(/export\s*\{\s*([^}]+)\s*\};?/g, (_match, exportsBlock: string) => {
                    return exportsBlock
                      .split(',')
                      .map((binding) => {
                        const trimmed = binding.trim()

                        if (!trimmed) {
                          return ''
                        }

                        const [original, alias] = trimmed.split(/\s+as\s+/)

                        if (alias) {
                          return `const ${alias} = ${original};`
                        }

                        return `const ${original} = ${original};`
                      })
                      .filter(Boolean)
                      .join('\n')
                  })
              }

              const inlineChunkDependencies = (chunk, seen = new Set<string>()) => {
                let prefix = ''

                for (const importedFileName of [...chunk.imports]) {
                  if (!importedFileName.endsWith('.js') || seen.has(importedFileName)) {
                    continue
                  }

                  const imported = bundle[importedFileName]

                  if (!imported || imported.type !== 'chunk') {
                    continue
                  }

                  seen.add(importedFileName)

                  prefix += inlineChunkDependencies(imported, seen)

                  const importPattern = new RegExp(
                    `(^|[\r\n])\s*import[^;]*?from\s+(["'])\.?/?${escapeRegex(importedFileName)}\\2;?`,
                    'g',
                  )

                  chunk.code = chunk.code.replace(importPattern, '$1')
                  prefix += `${convertExportsToAssignments(imported.code)}\n`

                  chunk.imports = chunk.imports.filter((name) => name !== importedFileName)
                  chunk.dynamicImports = chunk.dynamicImports.filter((name) => name !== importedFileName)

                  delete bundle[importedFileName]
                }

                return prefix
              }

              for (const bundleItem of Object.values(bundle)) {
                if (bundleItem.type !== 'chunk') {
                  continue
                }

                if (bundleItem.facadeModuleId !== contentEntryId) {
                  continue
                }

                const prefix = inlineChunkDependencies(bundleItem)

                if (prefix) {
                  bundleItem.code = `${prefix}${bundleItem.code}`
                }

                bundleItem.code = bundleItem.code.replace(
                  /(^|[\r\n])\s*import\s+(['"])(\.?\/[^'";]+\.css)\2;?/g,
                  (_fullMatch, linePrefix: string, _quote: string, importPath: string) => {
                    const normalizedPath = importPath.replace(/^\.\/?/, '')
                    const cssAsset = bundle[normalizedPath]

                    if (!cssAsset || cssAsset.type !== 'asset') {
                      return linePrefix
                    }

                    const cssSource = typeof cssAsset.source === 'string'
                      ? cssAsset.source
                      : Buffer.from(cssAsset.source).toString('utf8')

                    const styleInjection =
                      "(() => {\n" +
                      "  const style = document.createElement('style');\n" +
                      `  style.textContent = ${JSON.stringify(cssSource)};\n` +
                      "  document.head.appendChild(style);\n" +
                      "})();\n"

                    return `${linePrefix}${styleInjection}`
                  },
                )
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
