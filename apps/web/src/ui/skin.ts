import { formatValue } from '../display'
import { EFFECTS, type FxOrder, INDEX, PARAMS, type ParamDef, toNormalized, toPlain } from '../params'
import { COLUMNS, MIX, type Section } from './layout'

// The skin talks only to this bridge. The IvanDAW adapter implements it with direct calls; the JUCE editor
// (1.0.0) implements it over the WebView. The skin never knows which host runs it.
export interface SkinBridge {
    /** normalized 0..1 */
    value(id: string): number
    setParam(id: string, normalized: number, gesture?: 'begin' | 'end'): void
    /** Any parameter change, from any source. Returns an unsubscribe. */
    onParam(listener: (id: string, normalized: number) => void): () => void
    fxOrder(osc: 0 | 1): FxOrder
    setFxOrder(osc: 0 | 1, order: FxOrder): void
    onFxOrder(listener: (osc: 0 | 1, order: FxOrder) => void): () => void
}

// Keys a focused control uses. Everything else (space = play) reaches the DAW.
const CONTROL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'])

const EFFECT_LETTERS = ['D', 'R', 'F']

export interface Skin {
    root: HTMLElement
    destroy(): void
}

export function mountSkin(container: HTMLElement, bridge: SkinBridge): Skin {
    const doc = container.ownerDocument
    const root = doc.createElement('div')
    root.className = 'axp-root'
    root.addEventListener('keydown', (event) => {
        if (CONTROL_KEYS.has(event.key)) {
            event.stopPropagation()
        }
    })

    const refreshers = new Map<string, (normalized: number) => void>()
    const valueTexts: (() => void)[] = []
    const plainOf = (id: string) => {
        const index = INDEX.get(id)
        return index === undefined ? 0 : toPlain(PARAMS[index], bridge.value(id))
    }

    function row(p: ParamDef): HTMLElement {
        const el = doc.createElement('div')
        el.className = 'axp-row'
        const label = doc.createElement('span')
        label.className = 'axp-label'
        label.textContent = shortLabel(p)
        label.title = p.label
        if (p.kind !== 'float') {
            // Menus and toggles show their value themselves, across both columns.
            const c = control(p)
            c.classList.add('axp-wide')
            el.append(label, c)
            return el
        }
        const text = doc.createElement('span')
        text.className = 'axp-value'
        valueTexts.push(() => {
            text.textContent = formatValue(p, plainOf(p.id), plainOf)
        })
        el.append(label, control(p), text)
        return el
    }

    function control(p: ParamDef): HTMLElement {
        if (p.kind === 'boolean') {
            const button = doc.createElement('button')
            button.type = 'button'
            button.dataset.param = p.id
            button.setAttribute('aria-label', p.label)
            const show = (n: number) => {
                button.setAttribute('aria-pressed', String(n >= 0.5))
                button.textContent = n >= 0.5 ? 'On' : 'Off'
            }
            button.addEventListener('click', () => {
                bridge.setParam(p.id, bridge.value(p.id) >= 0.5 ? 0 : 1)
            })
            refreshers.set(p.id, show)
            return button
        }
        if (p.kind === 'choice' || p.kind === 'int') {
            const select = doc.createElement('select')
            select.dataset.param = p.id
            select.setAttribute('aria-label', p.label)
            for (let v = p.min; v <= p.max; v++) {
                const option = doc.createElement('option')
                option.value = String(v)
                option.textContent = formatValue(p, v, plainOf)
                select.append(option)
            }
            select.disabled = p.max === p.min
            select.addEventListener('change', () => {
                bridge.setParam(p.id, toNormalized(p, Number(select.value)))
            })
            refreshers.set(p.id, (n) => {
                select.value = String(toPlain(p, n))
            })
            return select
        }
        const range = doc.createElement('input')
        range.type = 'range'
        range.min = '0'
        range.max = '1'
        range.step = '0.001'
        range.dataset.param = p.id
        range.setAttribute('aria-label', p.label)
        let dragging = false
        range.addEventListener('pointerdown', () => {
            dragging = true
            bridge.setParam(p.id, Number(range.value), 'begin')
        })
        range.addEventListener('input', () => bridge.setParam(p.id, Number(range.value)))
        const end = () => {
            if (dragging) {
                dragging = false
                bridge.setParam(p.id, Number(range.value), 'end')
            }
        }
        range.addEventListener('pointerup', end)
        range.addEventListener('pointercancel', end)
        // Double-click: back to the default.
        range.addEventListener('dblclick', () => bridge.setParam(p.id, toNormalized(p, p.default)))
        refreshers.set(p.id, (n) => {
            range.value = String(n)
        })
        return range
    }

    function fxOrderRow(osc: 0 | 1): HTMLElement {
        const el = doc.createElement('div')
        el.className = 'axp-row'
        const label = doc.createElement('span')
        label.className = 'axp-label'
        label.textContent = 'FX order'
        const squares = doc.createElement('div')
        squares.className = 'axp-order'
        squares.setAttribute('role', 'group')
        squares.setAttribute('aria-label', `Osc ${osc + 1} effects order: click two to swap them`)
        const buttons: HTMLButtonElement[] = []
        let picked = -1
        const show = (order: FxOrder) => {
            buttons.forEach((button, position) => {
                button.textContent = EFFECT_LETTERS[order[position]]
                button.title = `${position + 1}: ${EFFECTS[order[position]]}`
                button.setAttribute('aria-label', `Position ${position + 1}: ${EFFECTS[order[position]]}`)
                button.classList.toggle('axp-picked', position === picked)
            })
        }
        for (let position = 0; position < 3; position++) {
            if (position > 0) {
                const arrow = doc.createElement('span')
                arrow.className = 'axp-arrow'
                arrow.textContent = '→'
                arrow.setAttribute('aria-hidden', 'true')
                squares.append(arrow)
            }
            const button = doc.createElement('button')
            button.type = 'button'
            button.addEventListener('click', () => {
                if (picked < 0) {
                    picked = position
                } else if (picked === position) {
                    picked = -1
                } else {
                    const order = [...bridge.fxOrder(osc)] as FxOrder
                    ;[order[picked], order[position]] = [order[position], order[picked]]
                    picked = -1
                    bridge.setFxOrder(osc, order)
                }
                show(bridge.fxOrder(osc))
            })
            buttons.push(button)
            squares.append(button)
        }
        const hint = doc.createElement('span')
        hint.className = 'axp-value'
        hint.textContent = 'click 2'
        el.append(label, squares, hint)
        orderViews.set(osc, show)
        show(bridge.fxOrder(osc))
        return el
    }

    const orderViews = new Map<0 | 1, (order: FxOrder) => void>()

    function section(s: Section): HTMLElement {
        const el = doc.createElement('section')
        el.className = 'axp-section'
        const h = doc.createElement('h2')
        h.textContent = s.title
        el.append(h)
        if (s.fxOrder !== undefined) {
            el.append(fxOrderRow(s.fxOrder))
        }
        for (const id of s.rows) {
            el.append(row(PARAMS[INDEX.get(id)!]))
        }
        return el
    }

    // Header: name and the mix strip.
    const head = doc.createElement('div')
    head.className = 'axp-head'
    const title = doc.createElement('div')
    title.className = 'axp-title'
    title.innerHTML = 'AXOLOTL PAD<small>pad generator</small>'
    const mix = doc.createElement('div')
    mix.className = 'axp-mix'
    mix.setAttribute('aria-label', MIX.title)
    for (const id of MIX.rows) {
        mix.append(row(PARAMS[INDEX.get(id)!]))
    }
    head.append(title, mix)

    const columns = doc.createElement('div')
    columns.className = 'axp-columns'
    for (const column of COLUMNS) {
        const el = doc.createElement('div')
        for (const s of column) {
            el.append(section(s))
        }
        columns.append(el)
    }
    root.append(head, columns)
    container.append(root)

    const showAll = () => {
        for (const [id, show] of refreshers) {
            show(bridge.value(id))
        }
        for (const show of valueTexts) {
            show()
        }
    }
    showAll()

    const stopParam = bridge.onParam((id) => {
        const show = refreshers.get(id)
        show?.(bridge.value(id))
        // Texts can depend on other parameters (an LFO time reads as beats or seconds).
        for (const showText of valueTexts) {
            showText()
        }
    })
    const stopOrder = bridge.onFxOrder((osc, order) => orderViews.get(osc)?.(order))

    return {
        root,
        destroy() {
            stopParam()
            stopOrder()
            root.remove()
        },
    }
}

// "Filter D/W 1" → "Filter D/W": the section title already says which oscillator or LFO.
function shortLabel(p: ParamDef): string {
    return p.label.replace(/^(LFO|Osc) \d /, '').replace(/ \d$/, '')
}
