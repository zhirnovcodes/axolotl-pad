import type { Event } from '../core/event'

/** 8 - Presets view: the PRESETS screen. A list of the built-in presets, then OPEN, SAVE and LOAD. */
export interface PresetsView {
    /** The list, in order. */
    setPresets(names: string[]): void
    /** The highlighted row (index into the list), -1 for none. */
    setSelected(index: number): void

    /** A row was clicked: highlight it. */
    readonly presetClicked: Event<number>
    /** A row was double-clicked or Enter pressed on it: open it. */
    readonly presetOpened: Event<number>
    /** OPEN: the highlighted built-in preset becomes the sound. */
    readonly openClicked: Event<void>
    /** SAVE: the sound goes to a file on the user's computer. */
    readonly saveClicked: Event<void>
    /** LOAD: a file from the user's computer becomes the sound. */
    readonly loadClicked: Event<void>
}
