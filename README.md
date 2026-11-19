# Axolotl Pad

Pad sound generator: MIDI notes in (8 voices), stereo audio out. Two looped sample oscillators, each with an
amp envelope, unison and its own Delay / Reverb / Filter chain in a user-chosen order; two LFOs that can move
any of 30 parameters. Effects come from [ivan-daw-engine-core](https://github.com/zhirnovcodes/ivan-daw-engine-core).

Builds as an [IvanDAW](https://github.com/zhirnovcodes/ivan-daw) web plugin today; VST3 / AU arrive in 1.0.0.
See [docs/plan.md](docs/plan.md) for the plan and the design, and [CLAUDE.md](CLAUDE.md) for the commands.

## Try it locally

```
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target axolotl-pad
pnpm install
pnpm --filter @axolotl-pad/web dev
```

Open the page, click **Start audio**, play with A W S E D F T G Y H U J K (Z / X change the octave) or a MIDI keyboard.

## Known limits (0.0.1)

- One built-in sample (Flute, root C4).
- Parameter automation applies when it arrives, not at its exact frame; notes and transport are frame-accurate.
