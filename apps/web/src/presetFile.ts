import type { StateData } from './state'

// A preset file (.axolotl): the whole sound, every parameter and both effects orders, under a name.
// `state` is the shared state format (state.ts), the same JSON the hosts save in a project, so a preset loads
// through the same reader as a project: unknown ids are ignored, missing or bad values become defaults.
//
//   { "format": "axolotl-pad-preset", "v": 1, "plugin": "com.ivandaw.axolotl-pad", "name": "Warm", "state": { ... } }
//
// Plain functions, no bundler features: the dev server's preset API (vite.presets.ts) uses them too.

export const PRESET_EXTENSION = '.axolotl'
export const PRESET_FORMAT = 'axolotl-pad-preset'
export const PRESET_VERSION = 1
/** The longest preset name. The PRESETS screen shows about 16 characters of it. */
export const PRESET_NAME_LENGTH = 40
/** The name SAVE uses before any preset was opened or loaded. */
export const DEFAULT_PRESET_NAME = 'Axolotl'

export interface Preset {
    name: string
    /** Shared state format (StateData). Read with readState, never trusted as is. */
    state: unknown
}

/**
 * A name that is safe as a file name on every OS: no path or reserved characters, no leading dots,
 * single spaces, at most PRESET_NAME_LENGTH characters. Can be empty.
 */
export function presetName(raw: string): string {
    return raw
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+/, '')
        .slice(0, PRESET_NAME_LENGTH)
        .trim()
}

/** "Warm pad" → "Warm pad.axolotl". */
export function presetFileName(name: string): string {
    return `${presetName(name) || DEFAULT_PRESET_NAME}${PRESET_EXTENSION}`
}

/** "C:\\x\\Warm pad.axolotl" or "Warm pad.axolotl" → "Warm pad". */
export function nameFromFileName(fileName: string): string {
    const base = fileName.split(/[\\/]/).pop() ?? ''
    return presetName(base.toLowerCase().endsWith(PRESET_EXTENSION) ? base.slice(0, -PRESET_EXTENSION.length) : base)
}

/** The file's text. */
export function writePreset(name: string, state: StateData, plugin: string): string {
    const file = { format: PRESET_FORMAT, v: PRESET_VERSION, plugin, name: presetName(name) || DEFAULT_PRESET_NAME, state }
    return JSON.stringify(file, null, 2) + '\n'
}

/**
 * A preset from a file's text, or null when it is not one. A bare saved state ({ v, params, fxOrder }) is read as
 * a preset too. `fallbackName` names it when the file does not (usually the file name).
 */
export function readPreset(text: string, fallbackName: string): Preset | null {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return null
    }
    if (!isObject(data)) return null
    const fileName = presetName(fallbackName)
    if (isObject(data.state) && isObject(data.state.params)) {
        const name = typeof data.name === 'string' ? presetName(data.name) : ''
        return { name: name || fileName || DEFAULT_PRESET_NAME, state: data.state }
    }
    if (isObject(data.params)) {
        return { name: fileName || DEFAULT_PRESET_NAME, state: data }
    }
    return null
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}
