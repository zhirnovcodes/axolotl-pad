import { defineConfig } from 'vitest/config'
import { devAssets } from './vite.assets.ts'
import { devPresets } from './vite.presets.ts'
import { processorScript } from './vite.processor.ts'

// The dev page (index.html): the plugin from source, with a keyboard, transport and level meter.
// processor.js, axolotl-pad.wasm and samples/ are served at the root, where host.assetUrl points.
// /__presets is the preset panel's API for the repo's presets/ folder (vite.presets.ts).
export default defineConfig({
    plugins: [processorScript('processor.js'), devAssets(), devPresets()],
    publicDir: false,
    // 5173 is ivan-daw's dev server. A fixed port of our own; strictPort fails loudly instead of wandering.
    server: { port: 5199, strictPort: true, fs: { allow: ['../..'] } },
    test: {
        include: ['src/**/*.test.ts'],
    },
})
