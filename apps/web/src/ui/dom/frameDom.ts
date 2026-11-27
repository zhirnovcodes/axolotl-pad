import { INDEX, param, PARAMS, toNormalized } from '../../params'
import { Emitter } from '../core/event'
import type { KnobEdit } from '../views/edit'
import type { FrameView } from '../views/frameView'
import type { DomEvents } from './domEvents'
import { clamp } from './widgets'

/** Screen pixels of vertical drag for the full knob range. Shift: five times finer. */
const DRAG_RANGE = 160

/** Drag travel (in knob range) a snap position holds the knob for, each side: about 4 px. */
const DETENT = 0.025

/** The knob position a drag sticks to: detune 0 Hz, pan centre, volume 1.0. */
export const KNOB_SNAPS: Record<string, number> = Object.fromEntries(
    [1, 2].flatMap((n) => [
        [`osc${n}Detune`, toNormalized(param(`osc${n}Detune`), 0)],
        [`osc${n}Pan`, toNormalized(param(`osc${n}Pan`), 0)],
        [`osc${n}Vol`, toNormalized(param(`osc${n}Vol`), 1)],
    ]),
)

/**
 * A detent: drag travel → knob value. Within DETENT of the snap the knob holds on it; past that it moves on from
 * there, so every value stays reachable (detune 1 Hz included) and the knob never jumps.
 */
export function detentValue(id: string, travel: number): number {
    const s = KNOB_SNAPS[id]
    if (s === undefined) return clamp(travel)
    if (Math.abs(travel - s) <= DETENT) return s
    return clamp(travel < s ? travel + DETENT : travel - DETENT)
}

/** The inverse of detentValue: where a drag starts from for knob value `value`. */
export function detentTravel(id: string, value: number): number {
    const s = KNOB_SNAPS[id]
    if (s === undefined || value === s) return value
    return value < s ? value - DETENT : value + DETENT
}

/**
 * The frame knobs: the `g.knob[data-param]` groups of the inline device.svg.
 * Drag up / down (a detent at KNOB_SNAPS), wheel, arrow keys; double-click resets. The pointer dot turns -135° .. +135°.
 */
export class FrameDomView implements FrameView {
    readonly knobChanged = new Emitter<KnobEdit>()
    readonly knobReset = new Emitter<number>()
    private readonly knobs = new Map<number, { el: SVGGElement; pointer: SVGGElement; value: number }>()

    constructor(svg: SVGSVGElement, events: DomEvents) {
        for (const el of svg.querySelectorAll<SVGGElement>('g.knob[data-param]')) {
            const index = INDEX.get(el.dataset.param ?? '')
            const pointer = el.querySelector<SVGGElement>('.knob-pointer')
            if (index === undefined || !pointer) continue
            const knob = { el, pointer, value: 0 }
            this.knobs.set(index, knob)
            el.setAttribute('tabindex', '0')
            el.setAttribute('role', 'slider')
            el.setAttribute('aria-label', PARAMS[index].label)
            el.setAttribute('aria-valuemin', '0')
            el.setAttribute('aria-valuemax', '1')
            events.watch(el, index)

            const emit = (edit: Omit<KnobEdit, 'index'>) => {
                this.knobChanged.emit({ index, ...edit })
                events.changed(index)
            }
            let drag: { y: number; from: number } | null = null
            el.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return
                event.preventDefault()
                el.focus()
                el.setPointerCapture(event.pointerId)
                drag = { y: event.clientY, from: detentTravel(el.dataset.param ?? '', knob.value) }
                emit({ value: knob.value, gesture: 'begin' })
            })
            el.addEventListener('pointermove', (event) => {
                if (!drag) return
                const fine = event.shiftKey ? 0.2 : 1
                emit({ value: detentValue(el.dataset.param ?? '', drag.from + ((drag.y - event.clientY) / DRAG_RANGE) * fine) })
            })
            const end = () => {
                if (!drag) return
                drag = null
                emit({ value: knob.value, gesture: 'end' })
            }
            el.addEventListener('pointerup', end)
            el.addEventListener('pointercancel', end)
            el.addEventListener('dblclick', () => {
                this.knobReset.emit(index)
                events.changed(index)
            })
            el.addEventListener('wheel', (event) => {
                event.preventDefault()
                emit({ value: clamp(knob.value + (event.deltaY < 0 ? 0.02 : -0.02)) })
            })
            el.addEventListener('keydown', (event) => {
                const step = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01, PageUp: 0.1, PageDown: -0.1 }[event.key]
                const to = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : step === undefined ? null : clamp(knob.value + step)
                if (to !== null) {
                    event.preventDefault()
                    emit({ value: to })
                }
            })
        }
    }

    /** params.json indexes of the knobs found in the SVG. */
    indexes(): number[] {
        return [...this.knobs.keys()]
    }

    setKnob(index: number, value: number): void {
        const knob = this.knobs.get(index)
        if (!knob) return
        knob.value = clamp(value)
        knob.pointer.setAttribute('transform', `rotate(${(-135 + 270 * knob.value).toFixed(1)})`)
        knob.el.setAttribute('aria-valuenow', knob.value.toFixed(3))
    }
}
