import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// The files the plugin folder carries next to index.js: the wasm and the built-in samples.
// The dev server serves them at the same relative paths the DAW build writes them to.

export const wasmPath = fileURLToPath(new URL('../../build/web/axolotl-pad.wasm', import.meta.url))
export const samplesDir = fileURLToPath(new URL('../../samples', import.meta.url))
export const wasmCommand =
    'emcmake cmake -S . -B build/web -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build/web --target axolotl-pad'

export function sampleFiles(): string[] {
    const doc = JSON.parse(fs.readFileSync(path.join(samplesDir, 'samples.json'), 'utf8')) as { samples: { file: string }[] }
    return doc.samples.map((sample) => sample.file)
}

const types: Record<string, string> = { '.wasm': 'application/wasm', '.wav': 'audio/wav', '.json': 'application/json' }

export function devAssets(): Plugin {
    return {
        name: 'axolotl-pad-dev-assets',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = decodeURIComponent(req.url?.split('?')[0] ?? '')
                let file: string | null = null
                if (url === '/axolotl-pad.wasm') {
                    file = wasmPath
                } else if (url.startsWith('/samples/') && sampleFiles().includes(url.slice('/samples/'.length))) {
                    file = path.join(samplesDir, url.slice('/samples/'.length))
                }
                if (!file) {
                    next()
                    return
                }
                if (!fs.existsSync(file)) {
                    res.statusCode = 404
                    res.end(file === wasmPath ? `build/web/axolotl-pad.wasm is missing. From the repo root:\n  ${wasmCommand}` : 'missing')
                    return
                }
                res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
                res.end(fs.readFileSync(file))
            })
        },
    }
}
