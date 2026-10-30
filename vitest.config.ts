import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

/** Imports `*.svg` as raw markup, like the esbuild text loader used for the extension. */
const svgText = {
  name: 'svg-text',
  enforce: 'pre' as const,
  load(id: string) {
    if (id.endsWith('.svg')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
    return null;
  },
};

export default defineConfig({
  plugins: [svgText],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
