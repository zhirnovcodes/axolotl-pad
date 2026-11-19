import { describe, expect, it } from 'vitest'
import { DIVISION_LABELS, divisionLabel, formatValue } from './display'
import { isFxOrder, LFO_TARGETS, PARAMS, param, toNormalized, toPlain } from './params'
import { SAMPLES } from './samples'
import { allRows } from './ui/layout'

// params.json is the one parameter list. The C++ side reads it through a header CMake writes from it.

describe('params.json', () => {
    it('has 42 parameters with unique ids', () => {
        const ids = PARAMS.map((p) => p.id)
        expect(ids.length).toBe(42)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('has well-formed ranges, defaults and choices', () => {
        for (const p of PARAMS) {
            expect(p.min, p.id).toBeLessThanOrEqual(p.max)
            expect(p.default, p.id).toBeGreaterThanOrEqual(p.min)
            expect(p.default, p.id).toBeLessThanOrEqual(p.max)
            expect(['float', 'int', 'boolean', 'choice', 'trigger'], p.id).toContain(p.kind)
            if (p.kind === 'choice') {
                expect(p.choices?.length, p.id).toBe(p.max - p.min + 1)
            } else {
                expect(p.choices, p.id).toBeUndefined()
            }
            if (p.kind === 'boolean') {
                expect([p.min, p.max], p.id).toEqual([0, 1])
            }
        }
    })

    it('lists every LFO target in both LFO map choices, in order', () => {
        const labels = LFO_TARGETS.map((p) => p.label)
        expect(labels.length).toBe(30)
        expect(param('lfo1Map').choices).toEqual(labels)
        expect(param('lfo2Map').choices).toEqual(labels)
    })

    it('makes only MIDI-controllable parameters automatable, and LFO targets automatable', () => {
        for (const p of LFO_TARGETS) {
            expect(p.automatable, p.id).toBe(true)
        }
        for (const id of ['lfo1Type', 'lfo1Map', 'lfo1Sync', 'lfo1Retrig', 'osc1Sample', 'unisonVoices', 'mixType']) {
            expect(param(id).automatable, id).toBe(false)
        }
    })

    it('marks the parameters that reset an oscillator’s effects', () => {
        const resets = PARAMS.filter((p) => p.resets).map((p) => [p.id, p.resets])
        expect(resets).toEqual([
            ['osc1On', 1],
            ['osc1Sample', 1],
            ['osc2On', 2],
            ['osc2Sample', 2],
        ])
    })

    it('offers one sample choice per built-in sample', () => {
        const labels = SAMPLES.map((s) => s.label)
        expect(param('osc1Sample').choices).toEqual(labels)
        expect(param('osc2Sample').choices).toEqual(labels)
        for (const s of SAMPLES) {
            expect(s.loopEnd, s.id).toBeGreaterThan(s.loopStart)
            expect(s.rootNote, s.id).toBeGreaterThanOrEqual(0)
            expect(s.rootNote, s.id).toBeLessThanOrEqual(127)
        }
    })

    it('has no parameter for effects order', () => {
        expect(PARAMS.some((p) => /order/i.test(p.id))).toBe(false)
    })
})

describe('normalized ↔ plain', () => {
    it('round-trips every parameter', () => {
        for (const p of PARAMS) {
            for (const n of [0, 0.25, 0.5, 1]) {
                const plain = toPlain(p, n)
                expect(plain, p.id).toBeGreaterThanOrEqual(p.min)
                expect(plain, p.id).toBeLessThanOrEqual(p.max)
                expect(toPlain(p, toNormalized(p, plain)), p.id).toBeCloseTo(plain, 9)
            }
        }
    })

    it('handles a one-value range', () => {
        const p = param('osc1Sample')
        expect(toNormalized(p, 0)).toBe(0)
        expect(toPlain(p, 1)).toBe(0)
    })

    it('rounds discrete kinds', () => {
        expect(toPlain(param('unisonVoices'), 0.6)).toBe(2)
        expect(toPlain(param('osc1On'), 0.7)).toBe(1)
    })
})

describe('effects order', () => {
    it('accepts permutations of 0, 1, 2 only', () => {
        expect(isFxOrder([2, 0, 1])).toBe(true)
        expect(isFxOrder([0, 0, 1])).toBe(false)
        expect(isFxOrder([0, 1, 3])).toBe(false)
        expect(isFxOrder([0, 1])).toBe(false)
        expect(isFxOrder('012')).toBe(false)
    })
})

describe('display', () => {
    const none = () => 0
    it('shows beat divisions like the engine picks them', () => {
        expect(DIVISION_LABELS.length).toBe(16)
        expect(divisionLabel(0, 14)).toBe('1/16t beats')
        expect(divisionLabel(1, 14)).toBe('4 beats')
        expect(divisionLabel(9 / 13, 14)).toBe('1 beat')
        expect(divisionLabel(1, 16)).toBe('8 beats')
        expect(formatValue(param('delayTime1'), param('delayTime1').default, none)).toBe('1 beat')
    })

    it('shows an LFO time as beats when synced and seconds when free', () => {
        const p = param('lfo1Time')
        expect(formatValue(p, 1, (id) => (id === 'lfo1Sync' ? 1 : 0))).toBe('8 beats')
        expect(formatValue(p, 1, () => 0)).toBe('8.00 s')
        expect(formatValue(p, 0, () => 0)).toBe('100 ms')
    })

    it('shows envelope times, offset and pan in their units', () => {
        expect(formatValue(param('osc1Attack'), 1, none)).toBe('1.00 s')
        expect(formatValue(param('osc1Release'), 1, none)).toBe('8.00 s')
        expect(formatValue(param('lfo1Offset'), 0.5, none)).toBe('180°')
        expect(formatValue(param('osc1Pan'), -0.5, none)).toBe('50L')
        expect(formatValue(param('osc1Pan'), 0, none)).toBe('C')
        expect(formatValue(param('unisonVoices'), 0, none)).toBe('Off')
        expect(formatValue(param('mixType'), 1, none)).toBe('Equal-power')
    })
})

describe('layout', () => {
    it('shows every parameter exactly once', () => {
        const rows = allRows()
        expect(new Set(rows).size).toBe(rows.length)
        expect([...rows].sort()).toEqual(PARAMS.map((p) => p.id).sort())
    })
})
