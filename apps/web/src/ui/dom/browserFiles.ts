import { PRESET_EXTENSION } from '../../presetFile'
import type { PresetFiles } from '../skin'

// SAVE and LOAD on the PRESETS screen in a browser (IvanDAW, the dev page): the user's own files.
// Save asks where (File System Access API) when the browser has it, else downloads. Load opens a file picker.

interface SaveFilePicker {
    showSaveFilePicker?(options: {
        suggestedName: string
        types: { description: string; accept: Record<string, string[]> }[]
    }): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>
}

const MIME = 'application/json'

export function browserFiles(doc: Document): PresetFiles {
    const win = doc.defaultView as (Window & SaveFilePicker) | null
    return {
        async save(fileName, text) {
            if (win?.showSaveFilePicker) {
                try {
                    const handle = await win.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{ description: 'Axolotl Pad preset', accept: { [MIME]: [PRESET_EXTENSION] } }],
                    })
                    const out = await handle.createWritable()
                    await out.write(text)
                    await out.close()
                    return true
                } catch (error) {
                    if ((error as DOMException)?.name === 'AbortError') return false
                    // Not allowed here (a cross-origin frame, say): fall back to a download.
                }
            }
            const url = URL.createObjectURL(new Blob([text], { type: MIME }))
            const a = doc.createElement('a')
            a.href = url
            a.download = fileName
            a.style.display = 'none'
            doc.body.append(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 10_000)
            return true
        },
        open() {
            return new Promise((resolve, reject) => {
                const input = doc.createElement('input')
                input.type = 'file'
                input.accept = `${PRESET_EXTENSION},${MIME}`
                input.style.display = 'none'
                let settled = false
                const done = (result: { name: string; text: string } | null) => {
                    if (settled) return
                    settled = true
                    input.remove()
                    resolve(result)
                }
                input.addEventListener('cancel', () => done(null))
                input.addEventListener('change', () => {
                    const file = input.files?.[0]
                    if (!file) return done(null)
                    file.text().then(
                        (text) => done({ name: file.name, text }),
                        (error) => {
                            settled = true
                            input.remove()
                            reject(error)
                        },
                    )
                })
                doc.body.append(input)
                input.click()
            })
        },
    }
}
