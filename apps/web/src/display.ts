import { type ParamDef } from './params'

// How a value reads on screen. The conversions mirror core/domain/ParamMap.h.

export const DIVISION_LABELS = ['1/16t', '1/16', '1/8t', '1/8', '1/4t', '1/4', '1/2t', '1/2', '1t', '1', '2t', '2', '4t', '4', '8t', '8']
export const DELAY_DIVISIONS = 14
export const LFO_DIVISIONS = 16

export function divisionLabel(knob: number, count: number): string {
    const i = Math.round(Math.min(1, Math.max(0, knob)) * (count - 1))
    const label = DIVISION_LABELS[i]
    return `${label} ${label === '1' ? 'beat' : 'beats'}`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function seconds(s: number): string {
    return s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`
}

/**
 * The text for `p` at plain value `v`. `valueOf` reads another parameter's plain value
 * (an LFO's time reads as beats or seconds depending on its sync toggle).
 */
export function formatValue(p: ParamDef, v: number, valueOf: (id: string) => number): string {
    const id = p.id
    if (p.kind === 'choice') {
        return p.choices?.[Math.round(v - p.min)] ?? String(v)
    }
    if (p.kind === 'boolean') {
        return v >= 0.5 ? 'On' : 'Off'
    }
    if (id === 'unisonVoices') {
        return v === 0 ? 'Off' : String(v)
    }
    if (id.startsWith('delayTime')) {
        return divisionLabel(v, DELAY_DIVISIONS)
    }
    const lfoTime = /^lfo(\d)Time$/.exec(id)
    if (lfoTime) {
        return valueOf(`lfo${lfoTime[1]}Sync`) >= 0.5 ? divisionLabel(v, LFO_DIVISIONS) : seconds(0.1 * 80 ** v)
    }
    if (/Offset$/.test(id)) {
        return `${Math.round(v * 360)}°`
    }
    if (/Attack$/.test(id)) {
        return seconds(lerp(0.01, 1, v))
    }
    if (/Release$/.test(id)) {
        return seconds(lerp(0.01, 8, v))
    }
    if (/^reverbFeedback/.test(id)) {
        return seconds(lerp(0.05, 30, v))
    }
    if (/Pan$/.test(id)) {
        if (Math.abs(v) < 0.005) {
            return 'C'
        }
        return `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`
    }
    if (id === 'unisonValue') {
        return `${Math.round(v * 100)} ct`
    }
    return `${Math.round(v * 100)}%`
}
