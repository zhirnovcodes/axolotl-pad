import { INDEX, LFO_TARGETS } from '../../params'
import { Subscriptions } from '../core/event'
import { LFO_TYPE_TEXT, lfoTargetShort } from '../data/paramText'
import type { EngineDataModel } from '../models/engineDataModel'
import type { LfoView } from '../views/lfoView'
import { applyEdit, readParam, readPosition, stepParam, toggleParam, writeParam } from './paramAccess'

/** Connects one LFO screen (lfo = 1 or 2) to the engine data model. Type wraps around. */
export class LfoPresenter {
    private readonly subs = new Subscriptions()
    private readonly ids: { type: string; map: string; sync: string; retrig: string; offset: string }

    constructor(
        lfo: 1 | 2,
        private readonly engine: EngineDataModel,
        private readonly view: LfoView,
    ) {
        const ids = { type: `lfo${lfo}Type`, map: `lfo${lfo}Map`, sync: `lfo${lfo}Sync`, retrig: `lfo${lfo}Retrig`, offset: `lfo${lfo}Offset` }
        this.ids = ids
        const mine = new Set(Object.values(ids).map((id) => INDEX.get(id)!))

        view.setMapList(LFO_TARGETS.map((_, i) => lfoTargetShort(i)))
        view.hideMap()
        view.setMapButtonClose()
        this.showAll()

        this.subs.add(
            view.openMapClicked.on(() => {
                view.setMapValue(readParam(engine, ids.map))
                view.openMap()
                view.setMapButtonOpen()
            }),
        )
        this.subs.add(view.closeMapClicked.on(() => this.closeMap()))
        this.subs.add(
            view.mapValueSelected.on((index) => {
                writeParam(engine, ids.map, index)
                this.closeMap()
            }),
        )
        this.subs.add(view.leftTypeClicked.on(() => stepParam(engine, ids.type, -1)))
        this.subs.add(view.rightTypeClicked.on(() => stepParam(engine, ids.type, +1)))
        this.subs.add(view.retrigClicked.on(() => toggleParam(engine, ids.retrig)))
        this.subs.add(view.syncClicked.on(() => toggleParam(engine, ids.sync)))
        this.subs.add(view.offsetChanged.on((edit) => applyEdit(engine, ids.offset, edit)))
        this.subs.add(
            engine.changed.on((index) => {
                if (mine.has(index)) this.showAll()
            }),
        )
    }

    dispose(): void {
        this.subs.dispose()
    }

    private closeMap(): void {
        this.view.hideMap()
        this.view.setMapButtonClose()
    }

    private showAll(): void {
        const { engine, view, ids } = this
        const map = readParam(engine, ids.map)
        view.setType(LFO_TYPE_TEXT[readParam(engine, ids.type)] ?? '')
        view.setMap(lfoTargetShort(map))
        view.setMapValue(map)
        view.setOffset(readPosition(engine, ids.offset))
        view.setRetrig(readParam(engine, ids.retrig) >= 0.5)
        view.setSync(readParam(engine, ids.sync) >= 0.5)
    }
}
