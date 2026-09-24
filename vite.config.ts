import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // pre-bundle worker deps so first export never triggers a mid-session
  // dependency re-optimization (which force-reloads the page)
  optimizeDeps: {
    include: ['@breezystack/lamejs'],
  },
  plugins: [
    preact(),
    // PWA (M6, ADR 008 D6): full precache incl. workers/wasm/demo — the
    // update flow is 'prompt' so an update never interrupts audio work
    VitePWA({
      registerType: 'prompt',
      // globPatterns already covers public/ wasm/wav/js + icons — no includeAssets
      manifest: {
        name: 'WaveForge',
        short_name: 'WaveForge',
        description: 'Free browser audio editor — private, offline-capable',
        theme_color: '#0a0e13',
        background_color: '#0a0e13',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,wav}'],
      },
    }),
  ],
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
  },
  preview: {
    host: true,
    allowedHosts: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        // pure modules — TDD'd; browser classes join as their harnesses land
        'src/core/**',
        'src/engine/viewState.ts',
        'src/engine/transportMath.ts',
        'src/engine/peaksCompute.ts',
        'src/engine/protocol.ts',
        'src/engine/AudioDocument.ts',
        'src/engine/peakClient.ts',
        'src/engine/editOps.ts',
        'src/engine/history.ts',
        'src/engine/AudioEditor.ts',
        'src/fx/curves.ts',
        'src/fx/limiter.ts',
        'src/fx/gate.ts',
        'src/fx/resample.ts',
        'src/fx/registry.ts',
        'src/fx/defs.ts',
        'src/fx/graphs.ts',
        // E1 mastering kernels (effects v2)
        'src/fx/mastering.ts',
        'src/fx/compressor.ts',
        // E2 parametric EQ (effects v2)
        'src/fx/biquad.ts',
        'src/fx/paramEq.ts',
        // M5 pure kernels
        'src/engine/lufs.ts',
        'src/engine/bpm.ts',
        'src/engine/spectrum.ts',
        'src/io/id3.ts',
        // M6 pure storage layer
        'src/storage/draftPayload.ts',
        'src/storage/autosave.ts',
        'src/storage/settings.ts',
        'src/io/wavEncoder.ts',
        'src/io/exportName.ts',
        'src/engine/recordBuffer.ts',
        'src/engine/meter.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
