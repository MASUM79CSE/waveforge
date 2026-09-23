import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // pre-bundle worker deps so first export never triggers a mid-session
  // dependency re-optimization (which force-reloads the page)
  optimizeDeps: {
    include: ['@breezystack/lamejs'],
  },
  plugins: [preact()],
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
        // M5 pure kernels
        'src/engine/lufs.ts',
        'src/engine/bpm.ts',
        'src/engine/spectrum.ts',
        'src/io/id3.ts',
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
