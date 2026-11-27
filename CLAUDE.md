# Axolotl Pad: rules for agents

Axolotl Pad is an audio instrument (pad generator) built two ways from one C++ core:
an IvanDAW web plugin (wasm, Plugin API v2) and, from 1.0.0, a JUCE plugin (VST3, AU, Standalone).

Plan and decisions: [docs/plan.md](docs/plan.md).
Guide: ivan-daw `docs/plugin-dev/` (README, 01-architecture, types/audio-instrument.md, 03-web-host, 04-vst-host, 05-ci-cd).
Reference implementation: zhirnovcodes/Beatality. Effects: zhirnovcodes/ivan-daw-engine-core `v0.1.0` (FetchContent).

## Names

| Thing | Value |
| --- | --- |
| Repo / wasm / zip | `axolotl-pad` / `axolotl-pad.wasm` / `axolotl-pad-daw.zip` |
| IvanDAW id | `com.ivandaw.axolotl-pad` |
| JUCE target (1.0.0) | `AxolotlPad` |
| C ABI prefix / namespace | `ap_` / `ap::` |
| AU codes (1.0.0) | manufacturer `Ivdw`, plugin `Axp1` |

## Folder map

| Folder | Holds | Uses |
| --- | --- | --- |
| `core/domain/` | ParamMap (conversions), AmpEnv, Lfo, LoopPlayer, OscMix | C++20 std only |
| `core/engine/` | ChainStage + Chain, OscBus, Engine | core, ivandaw engine-core |
| `hosts/web/boundary/` | C ABI → `axolotl-pad.wasm` | core |
| `hosts/web/audio-thread/` | AudioWorklet `processor.ts` (one file, no imports) | the wasm |
| `apps/web/src/` | `plugin.ts` (PluginFactory), `vst.ts` (skin in the JUCE window), params, display, samples, presets, dev page | ivandaw-core types |
| `apps/web/src/ui/` | the skin; talks only to `SkinBridge` | DOM |
| `samples/` | built-in samples + `samples.json` (root note, loop points) | both hosts |
| `presets/` | built-in presets `*.axolotl` (all params + effects orders), bundled into both builds; dev page panel edits it | both hosts |
| `params.json` | the only parameter list; CMake writes `ParamsJson.h` from it | both hosts |
| `hosts/plugin/` | JUCE processor, state JSON (same as web), editor (web view), `ui/index.html` | core, JUCE |
| `tests/` | `ap_tests` (core); `plugin/` `ap_plugin_tests` (JUCE host) | core, JUCE |

## Commands

```
# Two build folders, reused by every build: build/vst (native: core tests, JUCE plugin) and
# build/web (wasm, and the IvanDAW plugin in build/web/dist-daw). Never create other build folders.
# core tests (Windows: -G "Visual Studio 17 2022", then build\vst\Release\ap_tests.exe)
cmake -S . -B build/vst -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build/vst --target ap_tests && ./build/vst/ap_tests
# wasm
emcmake cmake -S . -B build/web -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build/web --target axolotl-pad
# IvanDAW plugin → build/web/dist-daw/
pnpm install
pnpm --filter @axolotl-pad/web build:daw
pnpm --filter @axolotl-pad/web dev      # dev page on http://localhost:5199 (5173 is ivan-daw): keyboard A–K, Z/X octave, Play/Stop, meter, preset panel
# JUCE plugin (macOS / Windows; -DAP_PLUGIN=OFF skips it). Artefacts: build/vst/AxolotlPad_artefacts/Release/
cmake --build build/vst --target ap_plugin_tests AxolotlPad_Standalone AxolotlPad_VST3   # + AxolotlPad_AU on macOS
# This Windows machine: 8 GB RAM, so build with -- -m:1 -p:CL_MPCount=2 (else the compiler runs out of heap)
```

## Rules

- All behaviour lives in `core/`. Hosts translate; they never decide musical behaviour.
- `params.json` is append-only. Ids and indexes never change.
- Effects order is state, not a parameter: no automation, MIDI learn or LFO may change it.
- The same input gives the same output for any block size. Core tests check sizes 1, 64, 128, 512, 4096.
- Every note-on gets a note-off path (stop, CC 120/123, `setState`, dispose).
- Every sound start, stop or change gets a fade (5 ms gate on resets, 5 ms note start, per-sample loop crossfade (default 100 ms), 5 ms steal fade).
- No allocation, lock or log in `Engine::process`.
- The release contract (tag `daw-build-<n>`, asset `axolotl-pad-daw.zip`, `index.js` at zip root) never changes
  without a matching ivan-daw change.
- You cannot hear. Every check says exactly what Ivan should listen for.

## Workflow

- Branch, PR to `master`. CI: `daw-plugin.yml` (core tests, PR artifact; release on `master`).
- Before pushing: core tests and `build:daw` pass locally.
- PR description ends with a **Ready for IvanDAW** section (release, port / param / state changes, what to listen for).
- ivan-daw is changed only in its own session (pin in `plugins/axolotl-pad/package.json`).
