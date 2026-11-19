import { defineConfig } from 'vitest/config'
import { devAssets } from './vite.assets.ts'
import { processorScript } from './vite.processor.ts'

// The dev page (index.html): the plugin from source, with a keyboard, transport and level meter.
// processor.js, axolotl-pad.wasm and samples/ are served at the root, where host.assetUrl points.
export default defineConfig({
    plugins: [processorScript('processor.js'), devAssets()],
    publicDir: false,
    server: { fs: { allow: ['../..'] } },
    test: {
        include: ['src/**/*.test.ts'],
    },
})
