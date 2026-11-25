import type { AxolotlView } from '../views/axolotlView'
import { div } from './widgets'

/**
 * The AXOLOTL page: the axolotl idling between the caption and output bars.
 * assets/sprites/axolotl-idle.png is 16 frames of 64 x 64 in one row; skin.css steps through them.
 * Free area on the page: y 29..105 (134 x 76), so the 64 x 64 sprite sits at (35, 35).
 */
export class AxolotlDomView implements AxolotlView {
    readonly el: HTMLDivElement

    constructor(doc: Document, page: HTMLElement) {
        this.el = div(doc, 'axp-axolotl', { x: 35, y: 35, w: 64, h: 64 })
        this.el.setAttribute('role', 'img')
        this.el.setAttribute('aria-label', 'Axolotl')
        page.append(this.el)
    }
}
