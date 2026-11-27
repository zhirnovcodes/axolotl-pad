import { nameFromFileName, type Preset, readPreset } from './presetFile'

// The built-in presets: every presets/*.axolotl in the repo, bundled into the plugin (index.js for IvanDAW,
// skin.js for the JUCE window), listed on the PRESETS screen. A file's name is the preset's name.
// The dev page's preset panel writes that folder and pushes the new list here, so the screen follows without a reload.

const files = import.meta.glob('../../../presets/*.axolotl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** The presets in `files` (path → text), sorted by name. Files that are not presets are skipped. */
export function presetsFrom(files: Record<string, string>): Preset[] {
    return Object.entries(files)
        .flatMap(([path, text]) => {
            const name = nameFromFileName(path)
            const preset = readPreset(text, name)
            return preset && name ? [{ name, state: preset.state }] : []
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }))
}

export class PresetLibrary {
    private presets: Preset[] = []
    private readonly listeners = new Set<() => void>()

    list(): readonly Preset[] {
        return this.presets
    }

    set(presets: Preset[]): void {
        this.presets = [...presets]
        for (const listener of [...this.listeners]) listener()
    }

    /** The list changed. Returns an unsubscribe. */
    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}

// One library for the page. In the dev server it survives this module's hot updates (a preset file added
// or removed), so a mounted skin keeps listening to the same one.
export const BUILT_IN_PRESETS: PresetLibrary = import.meta.hot?.data.library ?? new PresetLibrary()
BUILT_IN_PRESETS.set(presetsFrom(files))
if (import.meta.hot) {
    import.meta.hot.data.library = BUILT_IN_PRESETS
    import.meta.hot.accept()
}
