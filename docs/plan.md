# Axolotl Pad: development plan

Pad sound generator. MIDI notes (8 voices) and parameter automation in, stereo audio out.
Built the Beatality way from ivan-daw `docs/plugin-dev/` (type: **audio instrument**): one C++ core,
an IvanDAW web host (wasm + AudioWorklet), and later a JUCE host (VST3 / AU / Standalone).
Effects come from `zhirnovcodes/ivan-daw-engine-core` `v0.1.0` (Delay, Reverb, Filter, Unison).

## Names

| Placeholder | Value |
| --- | --- |
| `<name>` | `axolotl-pad` (repo, `axolotl-pad.wasm`, `axolotl-pad-daw.zip`) |
| `<Name>` | `AxolotlPad` |
| `<pfx>` | `ap` (C ABI `ap_*`, namespace `ap::`) |
| `<id>` | `com.ivandaw.axolotl-pad` |
| `<MFR>` / `<CODE>` | `Ivdw` / `Axp1` (check it is unused by other plugins) |
| Web package | `@axolotl-pad/web` in `apps/web` |
| Default branch | `master` (repo is empty today) |

## Releases

| Version | Content | Done when |
| --- | --- | --- |
| **0.0.1** | Core + web host, one sample (Flute), default black-and-white UI, dev page, `daw-plugin.yml` CI, pinned in ivan-daw | `daw-build-1` exists, ivan-daw plays it (checklist C) |
| **0.1.0** | Web version with the real design | Skin restyled; no param / state change |
| **1.0.0** | JUCE VST3 for Windows, VST3 + AU + Standalone for macOS, same skin in a WebView | `mac.yml` + `windows.yml` green, DAW matrix (checklist D) passed |

## MIDI input: Axolotl is an instrument

Notes are the main input. Every incoming note plays the sample at that note's pitch.

| Message | Behaviour |
| --- | --- |
| Note on (vel > 0) | Takes a free voice (or steals one). Both oscillators play their sample at `2^((note − rootNote)/12)` speed, so C4 plays the flute as recorded, C5 an octave up, C3 an octave down. Velocity scales the voice level (`vel / 127`). |
| Note off / note on vel 0 | That voice's envelopes release; the sample keeps looping until the release ends. |
| Several notes | Up to 8 at once (chords); a 9th steals the oldest released voice, then the oldest held. |
| CC 64 (sustain) | Holds note-offs while down. |
| CC 120 / 123 | All voices release. |
| Other CC, pitch bend | Ignored in 0.0.1. Knobs are moved by host automation (see MIDI control). |

Same in both hosts: IvanDAW `midi` events and DAW MIDI from a keyboard or clip reach the same
`Engine::midi()`.

## Signal flow

```
                 per voice (×8, fixed pool)                     per oscillator bus (×2)
note on ─► Osc1: LoopPlayer(sample1, pitch) ─► AmpEnv1 ─┐
           Osc2: LoopPlayer(sample2, pitch) ─► AmpEnv2 ─┤
                                                         │
   Σ voices, osc1 ─► Unison1 ─► Chain1 [order1: Delay/Reverb/Filter] ─┐
   Σ voices, osc2 ─► Unison2 ─► Chain2 [order2: Delay/Reverb/Filter] ─┴─► OscMix(osc mix, mix type) ─► guard clip ±1 ─► out L/R

LFO1, LFO2 (global) ─► modulate one mapped parameter each
```

- **AmpEnv** (per voice, per osc): attack / sustain 1 / release envelope × osc vol, then pan
  (stereo balance: centre = unity on both sides). The voice is free once both envelopes have finished releasing.
- **Effects are on the oscillator bus**, not per voice: 2 Unisons, 2 chains, 6 effect instances in all.
  Delay and reverb tails ring on after the voices end, as on a mixer channel. Memory and CPU stay small
  (a long delay line costs 2×, not 16×).
- **Osc on/off** gates the oscillator bus with a 5 ms fade.

### LoopPlayer (sample oscillator)

- Samples are built into the plugin (web zip `samples/`, JUCE binary data). `samples/samples.json` lists
  each one: `id`, `label`, `file`, `rootNote`, `loopStart`, `loopEnd`, `crossfade` (seconds).
- A note starts at `loopStart`, plays to `loopEnd` and loops back, forever while held.
- Pitch: rate = `2^((note − rootNote)/12) × sampleRateFile / sampleRateEngine`, linear interpolation.
- No click at the loop seam: every pass fades in at `loopStart` and out before `loopEnd` over the
  sample's `crossfade` (default 100 ms; 5 ms clicked). Two read heads: when head A enters its fade-out,
  head B starts at `loopStart`, and A fades out while B fades in (equal power). The note's first pass
  fades in over 5 ms only: there is nothing to crossfade with, and the amp envelope shapes the attack.
- Sample #0 (0.0.1, the only one): `flute.wav`, 44.1 kHz, stereo, 24-bit, root C4 (MIDI 60, measured
  ≈262 Hz), loop 0.110 s → 3.500 s.

### The chain: one interface for its three effects

```cpp
// core/engine/ChainStage.h
class ChainStage {                       // virtual is fine without RTTI
public:
    virtual ivandaw::fx::Sample Apply(ivandaw::fx::Sample s, float dt) = 0;
    virtual void Reset() = 0;
    virtual ~ChainStage() = default;
};
// 0 DelayStage   wraps ivandaw::fx::Delay
// 1 ReverbStage  wraps ivandaw::fx::Reverb
// 2 FilterStage  wraps ivandaw::fx::Filter
```

`Chain` holds `ChainStage* stage[3]` and `uint8_t order[3]`; per frame:
`for (i : 0..2) s = stage[order[i]]->Apply(s, dt);`. Stages read their params from a per-osc
`ResolvedParams` struct that the engine updates at control rate (every 32 frames), so `Apply` has the
signature asked for and no params argument.

### Effects order: state, not a parameter

`order1` / `order2` are int arrays, each a permutation of `[0 delay, 1 reverb, 2 filter]` (each effect
exactly once). Default `[2, 0, 1]` (filter → delay → reverb).

They are **not in `params.json`**, so no automation can reach them: not IvanDAW `automation` events,
not DAW automation or MIDI learn, not the LFOs. Only the plugin UI and `setState` change them.

| Where | How |
| --- | --- |
| Core | `Engine::setFxOrder(osc, a, b, c)`; invalid (not a permutation) → ignored |
| C ABI | `ap_set_fx_order(inst, osc, a, b, c)` |
| Web | UI → worklet message; state `data.fxOrder: [[2,0,1],[2,0,1]]` |
| JUCE | editor → lock-free queue; same JSON in `getStateInformation` |
| UI | three squares per oscillator; click one, then another, to swap them |

### Parameter → effect mapping

| Effect field | From |
| --- | --- |
| Delay `delayTime` | delay time knob → beat division (below) → `beats × 60 / bpm` seconds |
| Delay `feedback` | delay D/W (`invlerp(dw, 0, 1)` = `dw`) |
| Delay `mix` | delay D/W |
| Reverb `decay` | `lerp(0.05, 30, reverb feedback)` |
| Reverb `feedback` | reverb feedback |
| Reverb `mix` | reverb D/W |
| Filter `type` / `slope` | `Morph` / `Db12`, `morphLow 0.25`, `morphHigh 0.75` |
| Filter `filterPosition` | filter position |
| Filter `res` | `lerp(0, 0.5, filter D/W)` |
| Filter `mix` | `filter D/W × 0.88` |
| Unison (per osc, before the chain) `type` | `Detune` always |
| Unison `voices` | unison voices; **0 = off** (bypassed), 1..4 |
| Unison `param` | `unison value × 100` (cents) |
| Unison `mix` | unison value |
| AmpEnv attack | `lerp(0.01, 1, attack)` s |
| AmpEnv release | `lerp(0.01, 8, release)` s |

### Osc mix curves (`mix type`, M = 3)

| # | Curve | Gain osc1 / osc2 at `x` | Level at 0.5 (correlated / unrelated) | Use for |
| --- | --- | --- | --- | --- |
| 0 | Linear | `1−x` / `x` | 0 dB / −3 dB | same-pitch, detuned or synced sources |
| 1 | Equal-power | `cos(x·π/2)` / `sin(x·π/2)` | +3 dB / 0 dB | different samples or pitches (default) |
| 2 | Both full | `min(1, 2(1−x))` / `min(1, 2x)` | +6 dB / +3 dB | "more is louder" |

### Beat divisions

Values are in **beats**. A knob 0..1 picks `round(n × (count − 1))`, short → long:

- Delay (14): `1/16t, 1/16, 1/8t, 1/8, 1/4t, 1/4, 1/2t, 1/2, 1t, 1, 2t, 2, 4t, 4`
- LFO synced (16): the same plus `8t, 8`

`t` = triplet = ×2/3. Delay line sized for 4 beats at 30 BPM (8 s); BPM below 30 is clamped for the delay.

### LFOs

- Shapes: Tri, Square, Sine, Rand (smoothed brown-noise walk). All output 0..1.
- Free time: `0.1..8 s`, log scale. Synced time: beat divisions, phase computed from `beatAt(frame)`
  (never accumulated) so it stays locked after loops and tempo changes.
- Offset: `0..1` → `0..360°`, added to the phase: `shape((phase + offset) mod 1)`. No effect on Rand.
- Retrig on: phase resets (to the offset) on every note on.
- Map target: one of the N = 30 parameters marked "LFO controlled" (table #1–17, 22, 27, 28, 30–32,
  34–40). Effective value = `clamp(base + amp × (lfo − 0.5))` in normalized space; booleans read as
  `> 0.5`. LFO1 may target LFO2's amp / time / offset and vice versa.

### "Should reset effects"

When `osc N on/off` or `osc N sample` changes (O1 for osc 1, O2 for osc 2), or `order N` changes, osc
N's bus fades out over 5 ms, `Reset()`s its Unison and its three chain effects, then fades back in.
Only on a real change (an edge), including one caused by an LFO, never every block.

### MIDI control

"MIDI controlled = yes" means the parameter is exposed to the host as automatable
(`"automatable": true`). In IvanDAW, a controller knob drives it through `automation` events. In
Ableton, FL Studio, Logic etc., the DAW's own MIDI learn / controller mapping works on any automatable
plugin parameter, so the plugin needs no CC handling of its own. "No" → `"automatable": false`.

## params.json

Every row of the parameter table except effects order (rows 43, 44), in table order, append-only:
42 entries. The `params.json` index is not the table `#`. Ids are camelCase like Beatality's (`filterDw1`,
`filterPos1`, …, `lfo1Offset`, …, `mixType`). Two extra fields: `lfo: true` marks the 30 LFO targets,
`resets: 1 | 2` marks the parameters that reset an oscillator's effects.

| Table kind | `params.json` kind |
| --- | --- |
| knob float 0..1 | `float`, 0..1 (vol 0..1.2, pan −1..1) |
| LFO type, LFO map, osc sample, mix type | `choice` with labels (osc sample: one label, `Flute`, in 0.0.1) |
| toggle | `boolean` |
| unison voices | `int` 0..4 |

A Vitest check fails on a repeated id, a default out of range, or a mismatch with the C++ index enum
`core/domain/ParamIds.h`.

## Repo layout (from 01-architecture)

```
core/domain/    ParamIds.h, ParamMap (conversions, beat divisions), AmpEnv, Lfo, LoopPlayer, OscMix
core/engine/    ChainStage + 3 stages, Chain, OscBus (unison + chain + gate), Voice, Engine
hosts/web/      boundary/api.cpp, audio-thread/processor.ts
hosts/plugin/   (1.0.0) PluginProcessor, State (the web state JSON), PluginEditor and ui/ (C2)
apps/web/       src/plugin.ts (PluginFactory), params.ts, display.ts, samples.ts, manifest.ts, dev page,
                src/ui/ (the skin), vite configs. plugin.ts sits here, not in hosts/web, so it resolves ivandaw-core.
samples/        flute.wav, samples.json (both hosts read it)
tests/          ap_tests (core), plugin/ ap_plugin_tests (JUCE processor and state)
```

## Tasks

One PR per task group, `Ready for IvanDAW` section in each (checklist B).

### 0.0.1

Status 2026-11-19: A0–A9 built and checked locally (core tests on MSVC and clang, Vitest, `build:daw`,
headless Chromium run of the dev page). A10 needs the first push; A11 follows the first release.

| Id | Task | Check |
| --- | --- | --- |
| A0 ✅ | Bootstrap: layout, `.gitignore`, `CLAUDE.md` from template, pnpm root, CMake with `ap_core_flags()` and engine-core `FetchContent` | `cmake` configures; engine-core links |
| A1 ✅ | `params.json` (42 params) + `ParamsJson.h` written by CMake + Vitest check | Vitest |
| A2 ✅ | Domain: `ParamMap`, beat divisions, `AmpEnv`, `Lfo` (4 shapes, sync/free, offset, retrig), `OscMix` (3 curves), `LoopPlayer` (loop region, two heads, 5 ms crossfade, pitch) | core tests per unit; LoopPlayer: largest sample-to-sample step at the seam ≤ the largest step inside the loop |
| A3 ✅ | `ChainStage` + 3 stages + `Chain` with order permutation; `OscBus` with unison, gate fade and reset-with-fade | order changes the output; invalid order ignored; reset leaves no tail; no clicks |
| A4 ✅ | `Voice` + `Engine`: pool of 8, stealing (oldest released, then oldest held, 5 ms fade), note on/off, vel 0, CC 64, CC 120/123, transport / BPM, LFO routing, `tail` seconds | audio-instrument "Done when" list + same output for block sizes 1, 64, 128, 512, 4096 + 10 s fuzz without NaN |
| A5 ✅ | Samples in the wasm: C ABI `ap_set_sample(index, ptrL, ptrR, frames, rate, rootNote, loopStart, loopEnd)`; memory allocated off the audio thread (Beatality `bt_append` pattern) | Flute plays at the right pitch for C3 / C4 / C5 |
| A6 ✅ | wasm: `hosts/web/boundary/api.cpp` (+ `ap_set_fx_order`), `if(EMSCRIPTEN)` CMake branch | `emcmake … && cmake --build build/web --target axolotl-pad` |
| A7 ✅ | Web adapter: `processor.ts`, `plugin.ts`, `params.ts`, `manifest.ts`, `vite.daw.config.ts` (emits `samples/`), state `{ v: 1, params, fxOrder }` | `pnpm --filter @axolotl-pad/web build:daw` writes `dist-daw/` with `index.js`, `manifest.json`, `axolotl-pad.wasm`, `processor.js`, `samples/` |
| A8 ✅ | Default UI (black and white): groups Top level / Oscillators / Mix / LFO / Mapping; knobs, toggles, selectors, three-square effect order per osc; `data-param` on every parameter control; the skin talks only to the bridge interface | every param changes from the UI; reload restores state, effect order included |
| A9 ✅ | Dev page: AudioContext on click, Play/Stop, BPM, A–K keyboard, level meter | listen check |
| A10 ✅ | CI: `daw-plugin.yml` (Ubuntu), plus a core-test step there since `mac.yml` only arrives in 1.0.0 | PR artifact unzips with `index.js` at the root; merge → `daw-build-1` |
| A11 | ivan-daw (its own session): `plugins/axolotl-pad/package.json` pinned to `daw-build-1` | checklist C: Note hold → Axolotl Pad → Master |

### 0.1.0

Status 2026-11-20: done. The skin is final; no further UI work is planned.

| Id | Task |
| --- | --- |
| B1 ✅ | Apply the delivered design to `apps/web/src/ui/` only: tamagotchi device with pixel screens, 260 × 306 (manifest UI size was 920 × 520); same param ids, same bridge, same state |
| B2 ❌ | Visual feedback (filter curve, LFO shape and phase, envelope shape): dropped, the UI stays as is |
| B3 ✅ | More samples: 13 built-in samples with a per-sample loop crossfade (PR #1) |

### 1.0.0

Status 2026-11-20: C1–C4 built and checked on Windows (`ap_plugin_tests`; Standalone and VST3 build; the
Standalone window shows the skin). Not yet built on macOS (AU) or in CI (C5, C6).

| Id | Task |
| --- | --- |
| C1 ✅ | JUCE instrument target (`FORMATS AU VST3 Standalone`, `IS_SYNTH`), APVTS built from `params.json`; built on macOS and Windows only (`AP_PLUGIN`), so the Ubuntu job is unchanged |
| C2 ✅ | `PluginEditor`: WebView showing the same skin (`apps/web/src/vst.ts`, bundled by CMake into `skin.js`), bridge over `window.__JUCE__` (effect order over a lock-free queue) |
| C3 ✅ | Samples and `samples.json` embedded with `juce_add_binary_data` (built into the plugin, no install step) |
| C4 ✅ | `getStateInformation` writes the same JSON as the web `getState().data` |
| C5 | `mac.yml` (universal, ad-hoc signed, `auval -strict -v aumu Axp1 Ivdw`, pluginval 10) |
| C6 | `windows.yml` from 05-ci-cd (VST3 + Standalone, pluginval). The guide says to add it to Beatality first. |
| C7 | DAW matrix (checklist D) in Logic, Ableton, FL Studio on macOS and Windows, including MIDI-learning a knob; results in README |
