import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { nameFromFileName, PRESET_EXTENSION, presetName, readPreset } from './src/presetFile.ts'

// The built-in presets' folder: presets/*.axolotl at the repo root, bundled into both plugin builds (src/presets.ts).
// The dev server lets the dev page's preset panel edit it. Dev server only: the DAW build has no such API.
//
//   GET    /__presets          [{ name, text }] sorted by name
//   PUT    /__presets/<name>   body = the file's text → presets/<name>.axolotl
//   DELETE /__presets/<name>

export const presetsDir = fileURLToPath(new URL('../../presets', import.meta.url))
const ROUTE = '/__presets'
const MAX_BYTES = 256 * 1024

function list(): { name: string; text: string }[] {
    if (!fs.existsSync(presetsDir)) return []
    return fs
        .readdirSync(presetsDir)
        .filter((file) => file.toLowerCase().endsWith(PRESET_EXTENSION))
        .map((file) => ({ name: nameFromFileName(file), text: fs.readFileSync(path.join(presetsDir, file), 'utf8') }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }))
}

/** The file for `name`, or null when the name is not a clean preset name. */
function fileFor(name: string): string | null {
    if (!name || presetName(name) !== name) return null
    return path.join(presetsDir, name + PRESET_EXTENSION)
}

/** An existing file whose name differs only in case (Windows and macOS file systems ignore case). */
function sameNameFile(name: string): string | null {
    if (!fs.existsSync(presetsDir)) return null
    const key = (name + PRESET_EXTENSION).toLowerCase()
    const file = fs.readdirSync(presetsDir).find((f) => f.toLowerCase() === key)
    return file ? path.join(presetsDir, file) : null
}

export function devPresets(): Plugin {
    return {
        name: 'axolotl-pad-dev-presets',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0] ?? ''
                if (url !== ROUTE && !url.startsWith(ROUTE + '/')) {
                    next()
                    return
                }
                const reply = (status: number, body: unknown) => {
                    res.statusCode = status
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(body))
                }
                if (url === ROUTE) {
                    if (req.method === 'GET') reply(200, list())
                    else reply(405, { error: 'GET only' })
                    return
                }
                let name: string
                try {
                    name = decodeURIComponent(url.slice(ROUTE.length + 1))
                } catch {
                    reply(400, { error: 'bad name' })
                    return
                }
                const file = fileFor(name)
                if (!file) {
                    reply(400, { error: `not a preset name: ${name}` })
                    return
                }
                if (req.method === 'DELETE') {
                    const existing = sameNameFile(name)
                    if (!existing) {
                        reply(404, { error: `no preset ${name}` })
                        return
                    }
                    fs.rmSync(existing)
                    reply(200, list())
                    return
                }
                if (req.method !== 'PUT') {
                    reply(405, { error: 'PUT or DELETE' })
                    return
                }
                const chunks: Buffer[] = []
                let size = 0
                req.on('data', (chunk: Buffer) => {
                    size += chunk.length
                    if (size <= MAX_BYTES) chunks.push(chunk)
                })
                req.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8')
                    if (size > MAX_BYTES || !readPreset(text, name)) {
                        reply(400, { error: 'not a preset file' })
                        return
                    }
                    fs.mkdirSync(presetsDir, { recursive: true })
                    // Saving "warm" over "Warm": one file, under the new spelling.
                    const existing = sameNameFile(name)
                    if (existing && existing !== file) fs.rmSync(existing)
                    fs.writeFileSync(file, text)
                    reply(200, list())
                })
            })
        },
    }
}
