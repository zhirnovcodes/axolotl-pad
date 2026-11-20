// 2 - UI data: what the screen is showing. Plain data, no behaviour: MainUiModel owns it.

/** Screens in order; prev / next walk this list (and wrap). */
export const SCREENS = ['AXOLOTL', 'OSC1', 'OSC2', 'LFO1', 'LFO2', 'MIX'] as const
export type ScreenName = (typeof SCREENS)[number]

export const Screen = {
    Axolotl: 0,
    Osc1: 1,
    Osc2: 2,
    Lfo1: 3,
    Lfo2: 4,
    Mix: 5,
} as const

export const NO_FX_BUTTON = -1

export interface OscViewData {
    /** Effect-chain position (0..2) whose button is pressed, waiting for a second press to swap; -1 = none. */
    fxButtonPressed: number
}

export interface MainViewData {
    /** The output line at the bottom of the screen (max OUTPUT_LENGTH chars). */
    lowerText: string
    /** Index into SCREENS. */
    openedScreen: number
    /** OSC1, OSC2. */
    osc: [OscViewData, OscViewData]
}

export function initialMainViewData(): MainViewData {
    return {
        lowerText: '',
        openedScreen: Screen.Axolotl,
        osc: [{ fxButtonPressed: NO_FX_BUTTON }, { fxButtonPressed: NO_FX_BUTTON }],
    }
}
