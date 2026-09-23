import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
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
