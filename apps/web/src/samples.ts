import raw from '../../../samples/samples.json'

// The built-in samples. Their files ship in the plugin folder under samples/.
// The order is the osc sample choice order (params.json osc1Sample / osc2Sample).
export interface SampleInfo {
    id: string
    label: string
    file: string
    rootNote: number // the MIDI note the sample plays as recorded
    loopStart: number // seconds: a note starts here...
    loopEnd: number // ...and loops back from here
}

export const SAMPLES = raw.samples as SampleInfo[]
