// Where every parameter sits in the UI. Each params.json id appears exactly once (layout.test.ts).

export interface Section {
    title: string
    rows: string[]
    fxOrder?: 0 | 1 // show the effects-order squares for this oscillator
}

// The strip across the top.
export const MIX: Section = { title: 'Mix', rows: ['oscMix', 'mixType', 'unisonValue', 'unisonVoices'] }

// The three columns below it. LFO 1 and LFO 2 share the third.
export const COLUMNS: Section[][] = [
    [
        {
            title: 'Osc 1',
            fxOrder: 0,
            rows: ['osc1On', 'osc1Sample', 'osc1Vol', 'osc1Pan', 'osc1Attack', 'osc1Release', 'filterDw1', 'filterPos1', 'reverbDw1', 'reverbFeedback1', 'delayDw1', 'delayTime1'],
        },
    ],
    [
        {
            title: 'Osc 2',
            fxOrder: 1,
            rows: ['osc2On', 'osc2Sample', 'osc2Vol', 'osc2Pan', 'osc2Attack', 'osc2Release', 'filterDw2', 'filterPos2', 'reverbDw2', 'reverbFeedback2', 'delayDw2', 'delayTime2'],
        },
    ],
    [
        { title: 'LFO 1', rows: ['lfo1Type', 'lfo1Map', 'lfo1Amp', 'lfo1Time', 'lfo1Offset', 'lfo1Sync', 'lfo1Retrig'] },
        { title: 'LFO 2', rows: ['lfo2Type', 'lfo2Map', 'lfo2Amp', 'lfo2Time', 'lfo2Offset', 'lfo2Sync', 'lfo2Retrig'] },
    ],
]

export function allRows(): string[] {
    return [MIX, ...COLUMNS.flat()].flatMap((section) => section.rows)
}
