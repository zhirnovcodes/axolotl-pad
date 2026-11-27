import { ID } from '../../manifest'
import { DEFAULT_PRESET_NAME, nameFromFileName, presetFileName, readPreset, writePreset } from '../../presetFile'
import type { PresetLibrary } from '../../presets'
import { Subscriptions } from '../core/event'
import { outputLine } from '../data/paramText'
import type { EngineDataModel } from '../models/engineDataModel'
import type { MainUiModel } from '../models/mainUiModel'
import type { PresetFiles } from '../skin'
import type { PresetsView } from '../views/presetsView'

/**
 * Connects the PRESETS screen to the engine data model, the built-in preset library and the user's files.
 * The current name is the last preset opened or loaded; SAVE uses it as the file name.
 * Every action reports on the output line.
 */
export class PresetsPresenter {
    private readonly subs = new Subscriptions()
    private selected = -1
    /** The highlighted preset's name: the highlight follows it when the list changes. */
    private selectedName: string | null = null
    private name = DEFAULT_PRESET_NAME
    private disposed = false

    constructor(
        private readonly engine: EngineDataModel,
        private readonly ui: MainUiModel,
        private readonly view: PresetsView,
        private readonly library: PresetLibrary,
        private readonly files: PresetFiles,
    ) {
        this.showList()
        this.subs.add(library.onChange(() => this.showList()))
        this.subs.add(view.presetClicked.on((index) => this.select(index)))
        this.subs.add(
            view.presetOpened.on((index) => {
                this.select(index)
                this.open()
            }),
        )
        this.subs.add(view.openClicked.on(() => this.open()))
        this.subs.add(view.saveClicked.on(() => void this.save()))
        this.subs.add(view.loadClicked.on(() => void this.load()))
    }

    dispose(): void {
        this.disposed = true
        this.subs.dispose()
    }

    /** The name SAVE writes under. */
    getName(): string {
        return this.name
    }

    private select(index: number): void {
        const preset = this.library.list()[index]
        if (!preset) return
        this.selected = index
        this.selectedName = preset.name
        this.view.setSelected(index)
        this.ui.setOutputText(outputLine(null, preset.name))
    }

    private open(): void {
        const preset = this.library.list()[this.selected]
        if (!preset) {
            this.ui.setOutputText(outputLine(null, 'Pick a preset'))
            return
        }
        this.engine.load(preset.state)
        this.name = preset.name
        this.ui.setOutputText(outputLine('Open', preset.name))
    }

    private async save(): Promise<void> {
        const name = this.name
        const text = writePreset(name, this.engine.save(), ID)
        try {
            const saved = await this.files.save(presetFileName(name), text)
            if (!this.disposed && saved) this.ui.setOutputText(outputLine('Saved', name))
        } catch {
            if (!this.disposed) this.ui.setOutputText(outputLine(null, 'Save failed'))
        }
    }

    private async load(): Promise<void> {
        let file: { name: string; text: string } | null
        try {
            file = await this.files.open()
        } catch {
            if (!this.disposed) this.ui.setOutputText(outputLine(null, 'Load failed'))
            return
        }
        if (this.disposed || !file) return
        const preset = readPreset(file.text, nameFromFileName(file.name))
        if (!preset) {
            this.ui.setOutputText(outputLine(null, 'Not a preset'))
            return
        }
        this.engine.load(preset.state)
        this.name = preset.name
        this.selected = this.indexOf(preset.name)
        this.selectedName = this.selected < 0 ? null : preset.name
        this.view.setSelected(this.selected)
        this.ui.setOutputText(outputLine('Loaded', preset.name))
    }

    private showList(): void {
        // The highlight follows its preset by name when the list changes (the dev panel adds or deletes one).
        this.view.setPresets(this.library.list().map((p) => p.name))
        this.selected = this.selectedName === null ? -1 : this.indexOf(this.selectedName)
        if (this.selected < 0) this.selectedName = null
        this.view.setSelected(this.selected)
    }

    private indexOf(name: string): number {
        const key = name.toLowerCase()
        return this.library.list().findIndex((p) => p.name.toLowerCase() === key)
    }
}
