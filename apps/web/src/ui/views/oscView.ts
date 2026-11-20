import type { Event } from '../core/event'
import type { Edit } from './edit'

/** 5 - OSC view: one oscillator screen (OSC1 or OSC2). Sliders take positions 0..1. */
export interface OscView {
    getOn(): boolean
    setOn(on: boolean): void

    /** TYPE: the sample, a drop-down like the LFO map. */
    getSample(): string
    setSample(text: string): void
    setSampleList(items: string[]): void
    openSampleList(): void
    hideSampleList(): void
    setSampleValue(index: number): void
    setSampleButtonOpen(): void
    setSampleButtonClose(): void

    getVolume(): number
    setVolume(value: number): void
    getPan(): number
    setPan(value: number): void
    getAttack(): number
    setAttack(value: number): void
    getRelease(): number
    setRelease(value: number): void
    /** Letters on the three effect buttons, in chain order, e.g. ['F', 'D', 'R']. */
    getFxOrder(): string[]
    setFxOrder(letters: string[]): void
    /** Chain position shown pressed, or -1. */
    setFxButtonPressed(position: number): void

    readonly onClicked: Event<void>
    readonly openSampleClicked: Event<void>
    readonly closeSampleClicked: Event<void>
    /** Index into the sample list. */
    readonly sampleSelected: Event<number>
    readonly volumeChanged: Event<Edit>
    readonly panChanged: Event<Edit>
    readonly attackChanged: Event<Edit>
    readonly releaseChanged: Event<Edit>
    /** Chain position 0..2. */
    readonly fxButtonClicked: Event<number>
    readonly fxButtonReleased: Event<number>
}
