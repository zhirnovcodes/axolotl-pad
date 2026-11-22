import { INDEX } from '../../params'
import { Emitter } from '../core/event'
import { FX_ORDER_INDEX } from '../data/engineData'
import type { Edit } from '../views/edit'
import type { OscView } from '../views/oscView'
import type { DomEvents } from './domEvents'
import { arrowDown, label, PixelButton, PixelField, PixelList, PixelSlider, SHADOW } from './widgets'

/** OSC1 / OSC2 page. Positions: Figma frame "5", OSC1 screen (TYPE, A. R., OCT. < +2 >, ON, FX). */
export class OscDomView implements OscView {
    readonly onClicked = new Emitter<void>()
    readonly openSampleClicked = new Emitter<void>()
    readonly closeSampleClicked = new Emitter<void>()
    readonly sampleSelected = new Emitter<number>()
    readonly octaveDownClicked = new Emitter<void>()
    readonly octaveUpClicked = new Emitter<void>()
    readonly attackChanged = new Emitter<Edit>()
    readonly releaseChanged = new Emitter<Edit>()
    readonly fxButtonClicked = new Emitter<number>()
    readonly fxButtonReleased = new Emitter<number>()

    private readonly sample: PixelField
    private readonly sampleButton: PixelButton
    private readonly list: PixelList
    private readonly octave: PixelField
    private readonly attack: PixelSlider
    private readonly release: PixelSlider
    private readonly on: PixelButton
    private readonly fx: PixelButton[]
    private listOpen = false

    constructor(doc: Document, page: HTMLElement, events: DomEvents, osc: 1 | 2) {
        const id = (name: string) => INDEX.get(`osc${osc}${name}`)!
        const fxIndex = FX_ORDER_INDEX[osc - 1]

        // TYPE (sample): field + drop-down button
        this.sample = new PixelField(doc, { x: 39, y: 34, w: 75, h: 14 }, 44)
        this.sampleButton = new PixelButton(doc, { x: 115, y: 33, w: 14, h: 14 }, arrowDown(doc, 4, 2), `Osc ${osc} sample list`, SHADOW.dark)
        this.sampleButton.clicked.on(() => (this.listOpen ? this.closeSampleClicked : this.openSampleClicked).emit())
        this.list = new PixelList(doc, { box: { x: 39, y: 34, w: 74, h: 70 }, rows: 5, firstTop: 2, step: 13 }, `Osc ${osc} sample`, () => [this.sampleButton.el])
        this.list.selected.on((i) => {
            this.sampleSelected.emit(i)
            events.changed(id('Sample'))
        })
        this.list.dismissed.on(() => this.closeSampleClicked.emit())

        // A. R. sliders
        const slider = (name: string, x: number, y: number, w: number, aria: string, out: Emitter<Edit>) => {
            const s = new PixelSlider(doc, x, y, w, { label: `Osc ${osc} ${aria}` })
            s.edited.on((edit) => {
                out.emit(edit)
                events.changed(id(name))
            })
            events.watch(s.el, id(name))
            return s
        }
        this.attack = slider('Attack', 17, 57, 46, 'attack', this.attackChanged)
        this.release = slider('Release', 83, 57, 47, 'release', this.releaseChanged)

        // OCT.: < field >, -2 .. +2 (stops at the ends)
        const octDown = new PixelButton(doc, { x: 49, y: 67, w: 14, h: 14 }, '<', `Osc ${osc} octave down`)
        this.octave = new PixelField(doc, { x: 66, y: 68, w: 41, h: 14 }, 0, 12, true)
        const octUp = new PixelButton(doc, { x: 108, y: 67, w: 14, h: 14 }, '>', `Osc ${osc} octave up`)
        octDown.clicked.on(() => {
            this.octaveDownClicked.emit()
            events.changed(id('Oct'))
        })
        octUp.clicked.on(() => {
            this.octaveUpClicked.emit()
            events.changed(id('Oct'))
        })
        for (const e of [octDown.el, this.octave.el, octUp.el]) events.watch(e, id('Oct'))

        // ON, FX F D R
        this.on = new PixelButton(doc, { x: 4, y: 87, w: 31, h: 14 }, 'ON', `Osc ${osc} on`)
        this.on.clicked.on(() => {
            this.onClicked.emit()
            events.changed(id('On'))
        })
        this.fx = [79, 97, 115].map((x, position) => {
            const b = new PixelButton(doc, { x, y: 87, w: 14, h: 14 }, '', `Osc ${osc} effect ${position + 1}`)
            b.clicked.on(() => {
                this.fxButtonClicked.emit(position)
                events.changed(fxIndex)
            })
            b.el.addEventListener('pointerup', () => this.fxButtonReleased.emit(position))
            events.watch(b.el, fxIndex)
            return b
        })

        events.watch(this.sample.el, id('Sample'))
        events.watch(this.sampleButton.el, id('Sample'))
        events.watch(this.on.el, id('On'))

        page.append(
            label(doc, 'TYPE', 19, 34, 12, true),
            this.sample.el,
            this.sampleButton.el,
            label(doc, 'A.', 4, 53),
            this.attack.el,
            label(doc, 'R.', 67, 53),
            this.release.el,
            label(doc, 'OCT.', 32, 68, 12, true),
            octDown.el,
            this.octave.el,
            octUp.el,
            this.on.el,
            label(doc, 'FX', 63.5, 88, 12, true),
            ...this.fx.map((b) => b.el),
            this.list.el,
        )
    }

    getOn(): boolean {
        return this.on.isPressed()
    }
    setOn(on: boolean): void {
        this.on.setPressed(on)
    }

    getSample(): string {
        return this.sample.value
    }
    setSample(text: string): void {
        this.sample.value = text
    }
    setSampleList(items: string[]): void {
        this.list.setItems(items)
    }
    openSampleList(): void {
        this.listOpen = true
        this.list.show()
    }
    hideSampleList(): void {
        this.listOpen = false
        this.list.hide()
    }
    setSampleValue(index: number): void {
        this.list.setSelected(index)
    }
    setSampleButtonOpen(): void {
        this.sampleButton.el.classList.add('axp-open')
    }
    setSampleButtonClose(): void {
        this.sampleButton.el.classList.remove('axp-open')
    }

    getOctave(): string {
        return this.octave.value
    }
    setOctave(text: string): void {
        this.octave.value = text
    }
    getAttack(): number {
        return this.attack.value
    }
    setAttack(value: number): void {
        this.attack.value = value
    }
    getRelease(): number {
        return this.release.value
    }
    setRelease(value: number): void {
        this.release.value = value
    }

    getFxOrder(): string[] {
        return this.fx.map((b) => b.el.textContent ?? '')
    }
    setFxOrder(letters: string[]): void {
        this.fx.forEach((b, i) => b.setText(letters[i] ?? ''))
    }
    setFxButtonPressed(position: number): void {
        this.fx.forEach((b, i) => b.setPressed(i === position))
    }

    dispose(): void {
        this.list.dispose()
    }
}
