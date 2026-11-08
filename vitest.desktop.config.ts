import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'desktop-svg-text', enforce: 'pre',
    load(id: string) {
      if (id.endsWith('.svg')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
      return null;
    },
  }],
  test: {
    include: ['tests/desktop/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
