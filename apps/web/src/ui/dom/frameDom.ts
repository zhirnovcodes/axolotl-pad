import { INDEX, PARAMS } from '../../params'
import { Emitter } from '../core/event'
import type { KnobEdit } from '../views/edit'
import type { FrameView } from '../views/frameView'
import type { DomEvents } from './domEvents'
import { clamp } from './widgets'

/** Screen pixels of vertical drag for the full knob range. Shift: five times finer. */
const DRAG_RANGE = 160

/**
 * The frame knobs: the `g.knob[data-param]` groups of the inline device.svg.
 * Drag up / down, wheel, arrow keys; double-click resets. The pointer dot turns -135° .. +135°.
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
                drag = { y: event.clientY, from: knob.value }
                emit({ value: knob.value, gesture: 'begin' })
            })
            el.addEventListener('pointermove', (event) => {
                if (!drag) return
                const fine = event.shiftKey ? 0.2 : 1
                emit({ value: clamp(drag.from + ((drag.y - event.clientY) / DRAG_RANGE) * fine) })
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
