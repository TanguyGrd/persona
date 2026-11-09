import { build } from 'esbuild';
import { readFile, writeFile, cp } from 'node:fs/promises';
await build({ entryPoints: ['server/index.ts'], outfile: 'dist/agent-service/service.mjs', bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'esm', sourcemap: true, logLevel: 'info' });
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('dist/agent-service/package.json', JSON.stringify({ name: 'persona-agent-service', private: true, version: pkg.version, type: 'module', engines: { node: '>=22' }, scripts: { start: 'node service.mjs' }, dependencies: { undici: pkg.dependencies.undici } }, null, 2) + '\n');
await cp('THIRD-PARTY-NOTICES.md', 'dist/agent-service/THIRD-PARTY-NOTICES.md');
