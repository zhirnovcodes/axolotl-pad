import { Emitter } from '../core/event'
import type { PresetsView } from '../views/presetsView'
import { div, label, PixelButton } from './widgets'

/** Rows shown at once, their text box top and step. Figma frame "8", Presets window. */
const ROWS = 4
const FIRST_TOP = 32
const STEP = 13
/** The scroll track (2 px, #F2DFE7) and its 4 x 11 thumb. */
const TRACK = { x: 127, y: 32, h: 51 } as const
const THUMB_H = 11

/**
 * PRESETS page: four rows of preset names (wheel, drag the thumb or arrow keys to scroll), then OPEN, SAVE, LOAD.
 * Click a row to highlight it, double-click (or Enter) to open it.
 */
export class PresetsDomView implements PresetsView {
    readonly presetClicked = new Emitter<number>()
    readonly presetOpened = new Emitter<number>()
    readonly openClicked = new Emitter<void>()
    readonly saveClicked = new Emitter<void>()
    readonly loadClicked = new Emitter<void>()

    private readonly list: HTMLDivElement
    private readonly empty: HTMLDivElement
    private readonly thumb: HTMLDivElement
    private names: string[] = []
    private selected = -1
    private scroll = 0

    constructor(
        private readonly doc: Document,
        page: HTMLElement,
    ) {
        this.list = div(doc, 'axp-presets', { x: 0, y: FIRST_TOP, w: 124, h: ROWS * STEP })
        this.list.tabIndex = 0
        this.list.setAttribute('role', 'listbox')
        this.list.setAttribute('aria-label', 'Presets')
        this.empty = label(doc, 'NO PRESETS', 4, FIRST_TOP)
        this.empty.classList.add('axp-presets-empty')
        const track = div(doc, 'axp-presets-track', { x: TRACK.x, y: TRACK.y, w: 2, h: TRACK.h })
        this.thumb = div(doc, 'axp-handle axp-thumb axp-presets-thumb', { x: TRACK.x - 1, y: TRACK.y + 1, w: 4, h: THUMB_H })

        const button = (x: number, text: string, aria: string, out: Emitter<void>) => {
            const b = new PixelButton(doc, { x, y: 87, w: 34, h: 14 }, text, aria)
            b.clicked.on(() => out.emit())
            return b.el
        }
        page.append(
            this.list,
            this.empty,
            track,
            this.thumb,
            button(4, 'OPEN', 'Open the highlighted preset', this.openClicked),
            button(60, 'SAVE', 'Save the sound to a file', this.saveClicked),
            button(97, 'LOAD', 'Load a sound from a file', this.loadClicked),
        )

        this.list.addEventListener('wheel', (event) => {
            event.preventDefault()
            this.scrollTo(this.scroll + (event.deltaY > 0 ? 1 : -1))
        })
        this.list.addEventListener('keydown', (event) => {
            const last = this.names.length - 1
            if (last < 0) return
            const move = { ArrowDown: 1, ArrowUp: -1, PageDown: ROWS, PageUp: -ROWS }[event.key]
            if (move !== undefined || event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                let to: number
                if (event.key === 'Home') to = 0
                else if (event.key === 'End') to = last
                else if (this.selected < 0) to = move! > 0 ? 0 : last
                else to = Math.min(last, Math.max(0, this.selected + move!))
                this.presetClicked.emit(to)
            } else if (event.key === 'Enter' && this.selected >= 0) {
                event.preventDefault()
                this.presetOpened.emit(this.selected)
            }
        })

        let dragging = false
        const scrollFromPointer = (clientY: number) => {
            const rect = track.getBoundingClientRect()
            const t = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
            this.scrollTo(Math.round(Math.min(1, Math.max(0, t)) * this.maxScroll()))
        }
        this.thumb.addEventListener('pointerdown', (event) => {
            event.preventDefault()
            this.thumb.setPointerCapture(event.pointerId)
            dragging = true
        })
        this.thumb.addEventListener('pointermove', (event) => dragging && scrollFromPointer(event.clientY))
        this.thumb.addEventListener('pointerup', () => (dragging = false))
        this.thumb.addEventListener('pointercancel', () => (dragging = false))
        track.addEventListener('pointerdown', (event) => scrollFromPointer(event.clientY))
    }

    setPresets(names: string[]): void {
        this.names = [...names]
        this.list.replaceChildren(
            ...this.names.map((name, i) => {
                const row = div(this.doc, 'axp-text axp-t12 axp-list-row axp-presets-row', { x: 0, y: 0, w: 124 }, name)
                row.setAttribute('role', 'option')
                row.title = name
                row.addEventListener('click', () => this.presetClicked.emit(i))
                row.addEventListener('dblclick', () => this.presetOpened.emit(i))
                return row
            }),
        )
        this.empty.hidden = this.names.length > 0
        this.selected = Math.min(this.selected, this.names.length - 1)
        this.scrollTo(this.scroll)
        this.markSelected()
    }

    setSelected(index: number): void {
        this.selected = index >= 0 && index < this.names.length ? index : -1
        this.markSelected()
        // Keep the highlighted row in view.
        if (this.selected >= 0 && this.selected < this.scroll) this.scrollTo(this.selected)
        else if (this.selected >= this.scroll + ROWS) this.scrollTo(this.selected - ROWS + 1)
    }

    private markSelected(): void {
        this.list.querySelectorAll('.axp-presets-row').forEach((row, i) => row.setAttribute('aria-selected', String(i === this.selected)))
    }

    private maxScroll(): number {
        return Math.max(0, this.names.length - ROWS)
    }

    private scrollTo(scroll: number): void {
        this.scroll = Math.min(this.maxScroll(), Math.max(0, scroll))
        this.list.querySelectorAll<HTMLElement>('.axp-presets-row').forEach((row, i) => {
            const r = i - this.scroll
            row.hidden = r < 0 || r >= ROWS
            row.style.top = `${r * STEP}px`
        })
        const travel = TRACK.h - 2 - THUMB_H
        const t = this.maxScroll() === 0 ? 0 : this.scroll / this.maxScroll()
        this.thumb.style.top = `${Math.round(TRACK.y + 1 + t * travel)}px`
    }
}
