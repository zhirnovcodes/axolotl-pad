import { describe, expect, it } from 'vitest'
import { DEFAULT_FX_ORDER, type FxOrder, INDEX, PARAMS, toNormalized, toPlain } from '../params'
import { createUi, type Views } from './app'
import deviceSvg from './assets/device.svg?raw'
import { FRAME_KNOBS } from './presenters/framePresenter'
import { detentTravel, detentValue } from './dom/frameDom'
import { Emitter } from './core/event'
import { FX_ORDER_INDEX, PARAM_PATHS } from './data/engineData'
import { OUTPUT_LENGTH, PARAM_TEXT } from './data/paramText'
import { NO_FX_BUTTON, Screen } from './data/uiData'
import { EngineDataModel } from './models/engineDataModel'
import { MainUiModel } from './models/mainUiModel'
import { buildState, readState } from '../state'
import type { PresetFiles, SkinBridge } from './skin'
import { PresetLibrary, presetsFrom } from '../presets'
import { readPreset, writePreset } from '../presetFile'

/** In-memory bridge that echoes every change, like the plugin's. */
function fakeBridge() {
    const values = new Map(PARAMS.map((p) => [p.id, toNormalized(p, p.default)]))
    const orders: [FxOrder, FxOrder] = [[...DEFAULT_FX_ORDER], [...DEFAULT_FX_ORDER]]
    const params = new Emitter<[string, number]>()
    const fx = new Emitter<[0 | 1, FxOrder]>()
    const calls: string[] = []
    const bridge: SkinBridge = {
        value: (id) => values.get(id) ?? 0,
        setParam: (id, n, gesture) => {
            calls.push(`${id}=${n}${gesture ? ` ${gesture}` : ''}`)
            if (values.get(id) !== n) {
                values.set(id, n)
                params.emit([id, n])
            }
        },
        onParam: (l) => params.on(([id, n]) => l(id, n)),
        fxOrder: (osc) => [...orders[osc]] as FxOrder,
        setFxOrder: (osc, order) => {
            orders[osc] = [...order] as FxOrder
            fx.emit([osc, order])
        },
        onFxOrder: (l) => fx.on(([osc, order]) => l(osc, order)),
        saveState: () => buildState(PARAMS.map((p) => toPlain(p, values.get(p.id)!)), orders),
        loadState: (data) => {
            const saved = readState(data)
            PARAMS.forEach((p, i) => bridge.setParam(p.id, toNormalized(p, saved.values[i])))
            saved.fxOrder.forEach((order, osc) => bridge.setFxOrder(osc as 0 | 1, order))
        },
    }
    /** As if automation / MIDI moved a parameter. */
    const external = (id: string, plain: number) => bridge.setParam(id, toNormalized(PARAMS[INDEX.get(id)!], plain))
    return { bridge, calls, external }
}

type Fake = { state: Record<string, unknown> } & Record<string, Emitter<unknown>>

/** A view stand-in: setX / openMap... record into `state`, getX reads it, every other member is an Emitter. */
function fakeView(): Fake {
    const state: Record<string, unknown> = {}
    const events = new Map<string, Emitter<unknown>>()
    const view = new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
            if (prop === 'state') return state
            if (/^set/.test(prop)) return (v: unknown, w?: unknown) => (state[prop.slice(3)] = w === undefined ? v : [v, w])
            if (/^get/.test(prop)) return () => state[prop.slice(3)]
            if (/^(open|hide)\w+$/.test(prop) && !/(Clicked|Selected|Changed)$/.test(prop)) return () => (state[prop.replace(/^(open|hide)/, '') + 'Open'] = prop.startsWith('open'))
            if (!events.has(prop)) events.set(prop, new Emitter())
            return events.get(prop)
        },
    })
    return view as unknown as Fake
}

function fakeViews() {
    return {
        events: fakeView(),
        main: fakeView(),
        frame: fakeView(),
        axolotl: {},
        osc: [fakeView(), fakeView()],
        lfo: [fakeView(), fakeView(), fakeView()],
        mix: fakeView(),
        presets: fakeView(),
    }
}

/** Files in memory: `saved` collects SAVE, `next` is what LOAD picks (null = cancelled). */
function fakeFiles() {
    const saved: { fileName: string; text: string }[] = []
    let next: { name: string; text: string } | null = null
    const files: PresetFiles = {
        save: async (fileName, text) => {
            saved.push({ fileName, text })
            return true
        },
        open: async () => next,
    }
    return { files, saved, pick: (file: typeof next) => (next = file) }
}

const mount = (bridge: SkinBridge, views: ReturnType<typeof fakeViews>, library = new PresetLibrary(), files = fakeFiles().files) =>
    createUi(bridge, views as unknown as Views, { library, files })

const idx = (id: string) => INDEX.get(id)!

describe('controls', () => {
    it('every parameter has exactly one control: frame knobs in device.svg, the rest on the screens', () => {
        const knobs = [...deviceSvg.matchAll(/class="knob" data-param="(\w+)"/g)].map((m) => m[1])
        expect(new Set(knobs).size).toBe(knobs.length)
        expect(knobs.map(idx).sort((a, b) => a - b)).toEqual(FRAME_KNOBS)
        const screens = [
            ...[1, 2, 3].flatMap((n) => ['Type', 'Map', 'Sync', 'Retrig', 'Offset'].map((s) => `lfo${n}${s}`)),
            ...[1, 2].flatMap((n) => ['On', 'Sample', 'Oct', 'Attack', 'Release'].map((s) => `osc${n}${s}`)),
        ]
        screens.push('mixType', 'unisonValue', 'unisonVoices')
        expect([...knobs, ...screens].sort()).toEqual(PARAMS.map((p) => p.id).sort())
    })
})

describe('engine data', () => {
    it('places every parameter exactly once', () => {
        expect(Object.keys(PARAM_PATHS).sort()).toEqual(PARAMS.map((p) => p.id).sort())
        expect(new Set(Object.values(PARAM_PATHS).map((p) => p.join('.'))).size).toBe(PARAMS.length)
    })

    it('groups follow params.json "group"', () => {
        const group = { topLevel: 'Top level', lowerLevel: 'Lower level', mapping: 'Mapping', oscillators: 'Oscillators', mix: 'Mix' }
        for (const p of PARAMS) {
            expect(group[PARAM_PATHS[p.id][0]], p.id).toBe((p as { group?: string }).group)
        }
    })
})

describe('output line', () => {
    it('is caps and at most 20 chars for every parameter at min, default and max', () => {
        const { bridge, external } = fakeBridge()
        const model = new EngineDataModel(bridge)
        for (const p of PARAMS) {
            for (const v of [p.min, p.default, p.max]) {
                external(p.id, v)
                const line = model.getParamOutput(idx(p.id))
                expect(line.length, `${p.id}=${v}: ${line}`).toBeLessThanOrEqual(OUTPUT_LENGTH)
                expect(line).toBe(line.toUpperCase())
            }
        }
    })

    it('every parameter has output text, every LFO target an 8-char short name', () => {
        for (const p of PARAMS) {
            expect(PARAM_TEXT[p.id], p.id).toBeDefined()
            if (p.lfo) expect(PARAM_TEXT[p.id].short?.length, p.id).toBeLessThanOrEqual(8)
        }
    })

    it('formats each value format', () => {
        const { bridge, external } = fakeBridge()
        const model = new EngineDataModel(bridge)
        const out = (id: string, plain: number) => {
            external(id, plain)
            return model.getParamOutput(idx(id))
        }
        expect(out('filterDw1', 0.2)).toBe('FIL.1 DRY/WET 0.2')
        expect(out('reverbDw2', 0.3)).toBe('REVERB 2 DRY/WET 0.3')
        expect(out('oscMix', 0.25)).toBe('OSC. MIX -0.5')
        expect(out('oscMix', 0.5)).toBe('OSC. MIX 0.0')
        expect(out('osc1Pan', -0.5)).toBe('OSC1 PAN -0.5')
        expect(out('osc1Vol', 1.2)).toBe('OSC1 VOLUME 1.2')
        expect(out('osc2Detune', -1000)).toBe('OSC2 DETUNE -1000 HZ')
        expect(out('osc1Detune', 5)).toBe('OSC1 DETUNE +5 HZ')
        expect(out('osc1Detune', 0)).toBe('OSC1 DETUNE 0 HZ')
        expect(out('osc2Oct', 2)).toBe('OCTAVE +2')
        expect(out('osc1Oct', -1)).toBe('OCTAVE -1')
        expect(out('lfo3Amp', 0.5)).toBe('LFO 3 AMP. 0.5')
        expect(out('osc1Attack', 0)).toBe('ATTACK 0.01 S')
        expect(out('osc1Release', 1)).toBe('RELEASE 8.00 S')
        expect(out('lfo1Offset', 1)).toBe('PHASE OFFSET 360')
        expect(out('lfo1Type', 1)).toBe('TYPE SQUARE')
        expect(out('lfo1Map', 1)).toBe('FIL1 FRQ')
        expect(out('lfo1Retrig', 0)).toBe('RETRIG FALSE')
        expect(out('osc1On', 1)).toBe('ON/OFF TRUE')
        expect(out('osc1Sample', 1)).toBe('SAMPLE FLUTE 2')
        expect(out('mixType', 0)).toBe('OSC MIX LINEAR')
        expect(out('mixType', 1)).toBe('OSC MIX EQ. POW.')
        expect(out('delayTime1', 0)).toBe('DEL.1 TIME 1/16T')
        expect(out('delayTime2', 1)).toBe('DELAY 2 TIME 4')
        expect(out('unisonVoices', 2)).toBe('VOICES 2')
        external('lfo1Sync', 1)
        expect(out('lfo1Time', 0)).toBe('LFO 1 TIME 1/16T')
        external('lfo1Sync', 0)
        expect(out('lfo1Time', 1)).toBe('LFO 1 TIME 8.00 S')
        expect(model.getParamOutput(FX_ORDER_INDEX[0])).toBe('F > D > R')
    })
})

describe('EngineDataModel', () => {
    it('Set[group]Data sends only the changed values, then the echo updates data and fires changed', () => {
        const { bridge, calls } = fakeBridge()
        const model = new EngineDataModel(bridge)
        const changed: number[] = []
        model.changed.on((i) => changed.push(i))
        const top = model.getTopLevelData()
        top.osc2.delayDw = 0.75
        model.setTopLevelData(top)
        expect(calls).toEqual(['delayDw2=0.75'])
        expect(changed).toEqual([idx('delayDw2')])
        expect(model.getTopLevelData().osc2.delayDw).toBe(0.75)
    })

    it('reads changes from any source', () => {
        const { bridge, external } = fakeBridge()
        const model = new EngineDataModel(bridge)
        external('osc2Pan', -1)
        external('lfo2Sync', 0)
        expect(model.getTopLevelData().osc2.pan).toBe(-1)
        expect(model.getMappingData().lfo2.sync).toBe(false)
    })

    it('save / load use the shared state format and round-trip every value, effects order included', () => {
        const a = new EngineDataModel(fakeBridge().bridge)
        const top = a.getTopLevelData()
        top.oscMix = 0.9
        a.setTopLevelData(top)
        const osc = a.getOscillatorsData()
        osc.osc1.fxOrder = [1, 2, 0]
        osc.osc2.sample = 5
        a.setOscillatorsData(osc)
        const b = new EngineDataModel(fakeBridge().bridge)
        const saved = a.save()
        expect(saved.v).toBe(1)
        expect(saved.params.oscMix).toBe(0.9)
        expect(saved.fxOrder[0]).toEqual([1, 2, 0])
        b.load(JSON.parse(JSON.stringify(saved)))
        expect(b.getData()).toEqual(a.getData())
    })
})

describe('MainUiModel', () => {
    it('walks the screens and wraps', () => {
        const ui = new MainUiModel()
        expect(ui.getCurrentScreen()).toBe(Screen.Axolotl)
        ui.prevScreen()
        expect(ui.getCurrentScreen()).toBe(Screen.Presets)
        ui.nextScreen()
        ui.nextScreen()
        expect(ui.getCurrentScreen()).toBe(Screen.Osc1)
    })

    it('cuts the output text to 20 chars', () => {
        const ui = new MainUiModel()
        ui.setOutputText('X'.repeat(30))
        expect(ui.getOutputText()).toHaveLength(20)
    })
})

describe('presenters', () => {
    it('main: caption follows the screen; hover shows the output, leave clears it', () => {
        const { bridge, external } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        expect(views.main.state.CaptionText).toBe('AXOLOTL')
        views.main.nextClicked.emit(undefined)
        expect(views.main.state).toMatchObject({ ScreenIndex: 1, CaptionText: 'OSC1' })

        views.events.paramHovered.emit(idx('filterDw1'))
        expect(views.main.state.OutputText).toBe('FIL.1 DRY/WET 0.0')
        external('filterDw1', 0.7) // automation while hovered
        expect(views.main.state.OutputText).toBe('FIL.1 DRY/WET 0.7')
        views.events.paramLeft.emit(idx('filterDw1'))
        expect(views.main.state.OutputText).toBe('')
    })

    it('frame: knob edit with gesture reaches the engine; engine change moves the knob', () => {
        const { bridge, calls, external } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        views.frame.knobChanged.emit({ index: idx('oscMix'), value: 0.3, gesture: 'begin' })
        expect(calls.slice(-2)).toEqual(['oscMix=0.5 begin', 'oscMix=0.3'])
        external('lfo2Time', 1)
        expect(views.frame.state.Knob).toEqual([idx('lfo2Time'), 1])
    })

    it('osc: effect buttons swap through the UI model and show the output', () => {
        const { bridge } = fakeBridge()
        const views = fakeViews()
        const app = mount(bridge, views)
        const osc = views.osc[0]
        expect(osc.state.FxOrder).toEqual(['F', 'D', 'R'])
        const click = (position: number) => {
            osc.fxButtonClicked.emit(position) // a view raises its own event first, then the event-view one
            views.events.paramChanged.emit(FX_ORDER_INDEX[0])
        }
        views.events.paramHovered.emit(FX_ORDER_INDEX[0])
        expect(views.main.state.OutputText).toBe('F > D > R')
        click(0)
        expect(app.ui.getFxButtonPressed(0)).toBe(0)
        expect(osc.state.FxButtonPressed).toBe(0)
        expect(views.main.state.OutputText).toBe('FIL. REPLACE')
        click(2)
        expect(osc.state.FxOrder).toEqual(['R', 'D', 'F'])
        expect(app.ui.getFxButtonPressed(0)).toBe(NO_FX_BUTTON)
        expect(views.main.state.OutputText).toBe('R > D > F')
        expect(bridge.fxOrder(0)).toEqual([1, 0, 2])
    })

    it('lfo: map list opens, selecting a target writes it and closes the list', () => {
        const { bridge } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        const lfo = views.lfo[1]
        const list = lfo.state.MapList as string[]
        expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })))
        expect(list.slice(0, 3)).toEqual(['DEL1 DW', 'DEL1 TIM', 'DEL2 DW'])
        expect(lfo.state.MapValue).toBe(list.indexOf('FIL2 FRQ')) // lfo2Map default 7 = filter position 2
        lfo.openMapClicked.emit(undefined)
        expect(lfo.state.MapOpen).toBe(true)
        const row = list.indexOf('REV1 FB')
        lfo.mapValueSelected.emit(row)
        expect(lfo.state).toMatchObject({ MapOpen: false, Map: 'REV1 FB', MapValue: row })
        expect(bridge.value('lfo2Map')).toBeCloseTo(3 / 36) // stored as the choice index, not the row
        lfo.rightTypeClicked.emit(undefined)
        lfo.rightTypeClicked.emit(undefined)
        expect(lfo.state.Type).toBe('TRI') // Sine → Rand → wraps to Tri
    })

    it('osc: sample drop-down selects a sample and closes', () => {
        const { bridge } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        const osc = views.osc[1]
        expect((osc.state.SampleList as string[])[0]).toBe('FLUTE')
        osc.openSampleClicked.emit(undefined)
        osc.sampleSelected.emit(2)
        expect(osc.state).toMatchObject({ Sample: 'OBOE', SampleValue: 2 })
        expect(bridge.value('osc2Sample')).toBeCloseTo(2 / 13)
    })

    it('osc: octave arrows step -2..+2 and stop at the ends', () => {
        const { bridge } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        const osc = views.osc[0]
        expect(osc.state.Octave).toBe('0')
        osc.octaveUpClicked.emit(undefined)
        expect(osc.state.Octave).toBe('+1')
        for (let i = 0; i < 4; i++) osc.octaveUpClicked.emit(undefined)
        expect(osc.state.Octave).toBe('+2')
        for (let i = 0; i < 9; i++) osc.octaveDownClicked.emit(undefined)
        expect(osc.state.Octave).toBe('-2')
        expect(bridge.value('osc1Oct')).toBe(0)
    })

    it('lfo3: its own screen and presenter', () => {
        const { bridge, external } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        const lfo = views.lfo[2]
        expect(lfo.state.Map).toBe('OSC MIX')
        external('lfo3Map', 35)
        expect(lfo.state.Map).toBe('OSC1 DT')
        lfo.syncClicked.emit(undefined)
        expect(bridge.value('lfo3Sync')).toBe(0)
        expect(views.lfo[0].state.Sync).toBe(true)
    })

    it('frame: detune, pan and volume knobs hold at 0 Hz, centre and 1.0, and every value stays reachable', () => {
        expect(detentValue('osc1Detune', 0.51)).toBe(0.5)
        expect(detentValue('osc1Detune', 0.475)).toBe(0.5)
        expect(detentValue('osc2Pan', 0.49)).toBe(0.5)
        expect(detentValue('osc1Vol', 0.82)).toBeCloseTo(1 / 1.2)
        expect(detentValue('filterDw1', 0.51)).toBe(0.51)
        // Just past the detent: 1 Hz (1 / 2000 of the range) above 0, not a jump to 50 Hz.
        expect(toPlain(PARAMS[idx('osc1Detune')], detentValue('osc1Detune', 0.5 + 0.025 + 0.0005))).toBeCloseTo(1)
        // The ends are still reachable, and a drag starts where the knob is.
        expect(detentValue('osc1Detune', detentTravel('osc1Detune', 1))).toBeCloseTo(1)
        expect(detentValue('osc1Detune', detentTravel('osc1Detune', 0))).toBeCloseTo(0)
        expect(detentValue('osc2Detune', detentTravel('osc2Detune', 0.3))).toBeCloseTo(0.3)
    })

    it('frame: double-click resets a knob to its default', () => {
        const { bridge, external } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        external('reverbDw1', 0.9)
        views.frame.knobReset.emit(idx('reverbDw1'))
        expect(views.frame.state.Knob).toEqual([idx('reverbDw1'), 0.3])
    })

    it('main: LFO time line follows its sync toggle; other changes leave the line alone', () => {
        const { bridge, external } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        external('lfo1Time', 0)
        views.events.paramHovered.emit(idx('lfo1Time'))
        expect(views.main.state.OutputText).toBe('LFO 1 TIME 1/16T')
        external('lfo1Sync', 0)
        expect(views.main.state.OutputText).toBe('LFO 1 TIME 0.10 S')
        external('osc2Vol', 0.2)
        expect(views.main.state.OutputText).toBe('LFO 1 TIME 0.10 S')
    })

    it('mix: voices stop at the ends', () => {
        const { bridge } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views)
        views.mix.voicesLeftClicked.emit(undefined)
        expect(views.mix.state.Voices).toBe('0')
        for (let i = 0; i < 6; i++) views.mix.voicesRightClicked.emit(undefined)
        expect(views.mix.state.Voices).toBe('4')
    })

    it('presets: the list shows the library and follows it', () => {
        const library = new PresetLibrary()
        library.set([{ name: 'Bravo', state: {} }, { name: 'Alpha', state: {} }])
        const { bridge } = fakeBridge()
        const views = fakeViews()
        mount(bridge, views, library)
        expect(views.presets.state.Presets).toEqual(['Bravo', 'Alpha'])
        views.presets.presetClicked.emit(1)
        expect(views.presets.state.Selected).toBe(1)
        expect(views.main.state.OutputText).toBe('ALPHA')
        // A preset added before it: the highlight stays on Alpha.
        library.set([{ name: 'Aardvark', state: {} }, { name: 'Alpha', state: {} }, { name: 'Bravo', state: {} }])
        expect(views.presets.state.Selected).toBe(1)
        library.set([{ name: 'Bravo', state: {} }])
        expect(views.presets.state.Selected).toBe(-1)
    })

    it('presets: OPEN loads the highlighted preset, params and effects order', () => {
        const { bridge } = fakeBridge()
        const warm = buildState(
            PARAMS.map((p) => (p.id === 'osc1Detune' ? 120 : p.id === 'reverbDw1' ? 0.9 : p.default)),
            [[0, 1, 2], [1, 2, 0]],
        )
        const library = new PresetLibrary()
        library.set([{ name: 'Warm', state: warm }])
        const views = fakeViews()
        mount(bridge, views, library)
        views.presets.openClicked.emit(undefined)
        expect(views.main.state.OutputText).toBe('PICK A PRESET')
        expect(toPlain(PARAMS[idx('osc1Detune')], bridge.value('osc1Detune'))).toBe(0)
        views.presets.presetOpened.emit(0)
        expect(toPlain(PARAMS[idx('osc1Detune')], bridge.value('osc1Detune'))).toBeCloseTo(120)
        expect(toPlain(PARAMS[idx('reverbDw1')], bridge.value('reverbDw1'))).toBeCloseTo(0.9)
        expect(bridge.fxOrder(1)).toEqual([1, 2, 0])
        expect(views.main.state.OutputText).toBe('OPEN WARM')
    })

    it('presets: SAVE writes the sound under the current name, LOAD reads it back', async () => {
        const { bridge, external } = fakeBridge()
        const views = fakeViews()
        const disk = fakeFiles()
        mount(bridge, views, new PresetLibrary(), disk.files)
        external('osc2Detune', -300)
        bridge.setFxOrder(0, [1, 0, 2])
        views.presets.saveClicked.emit(undefined)
        await Promise.resolve()
        expect(disk.saved).toHaveLength(1)
        expect(disk.saved[0].fileName).toBe('Axolotl.axolotl')
        const file = JSON.parse(disk.saved[0].text)
        expect(file).toMatchObject({ format: 'axolotl-pad-preset', v: 1, plugin: 'com.ivandaw.axolotl-pad', name: 'Axolotl' })
        expect(file.state.params.osc2Detune).toBeCloseTo(-300)
        expect(file.state.fxOrder).toEqual([[1, 0, 2], [2, 0, 1]])
        expect(Object.keys(file.state.params)).toHaveLength(PARAMS.length)

        // Change everything back, then load the file: the sound and its name come back.
        bridge.loadState({})
        expect(toPlain(PARAMS[idx('osc2Detune')], bridge.value('osc2Detune'))).toBe(0)
        disk.pick({ name: 'My pad.axolotl', text: disk.saved[0].text.replace('"name": "Axolotl"', '"name": "My pad"') })
        views.presets.loadClicked.emit(undefined)
        await new Promise((r) => setTimeout(r))
        expect(toPlain(PARAMS[idx('osc2Detune')], bridge.value('osc2Detune'))).toBeCloseTo(-300)
        expect(bridge.fxOrder(0)).toEqual([1, 0, 2])
        expect(views.main.state.OutputText).toBe('LOADED MY PAD')
        views.presets.saveClicked.emit(undefined)
        await Promise.resolve()
        expect(disk.saved[1].fileName).toBe('My pad.axolotl')

        disk.pick({ name: 'notes.txt', text: 'hello' })
        views.presets.loadClicked.emit(undefined)
        await new Promise((r) => setTimeout(r))
        expect(views.main.state.OutputText).toBe('NOT A PRESET')
    })
})

describe('preset files', () => {
    it('round-trip, read a bare state, reject the rest', () => {
        const state = buildState(PARAMS.map((p) => p.default), [[2, 0, 1], [2, 0, 1]])
        expect(readPreset(writePreset('Soft / pad?', state, 'x'), 'file')).toEqual({ name: 'Soft pad', state })
        expect(readPreset(JSON.stringify(state), 'Bare')?.name).toBe('Bare')
        expect(readPreset('{"a": 1}', 'x')).toBeNull()
        expect(readPreset('not json', 'x')).toBeNull()
    })

    it('built-in presets are named by their file and sorted', () => {
        const text = writePreset('Inside name', buildState(PARAMS.map((p) => p.default), [[2, 0, 1], [2, 0, 1]]), 'x')
        const list = presetsFrom({ '../../../presets/Pad 10.axolotl': text, '../../../presets/Pad 2.axolotl': text, '../../../presets/Bad.axolotl': '{' })
        expect(list.map((p) => p.name)).toEqual(['Pad 2', 'Pad 10'])
    })
})
