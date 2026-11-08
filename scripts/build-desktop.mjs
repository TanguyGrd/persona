import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = `${root}dist/windows`;
await mkdir(outdir, { recursive: true });
const options = {
  absWorkingDir: root,
  entryPoints: ['src/hosts/windows/windows.ts'],
  outdir, bundle: true, format: 'esm', target: 'chrome116',
  loader: { '.svg': 'text' }, sourcemap: true, logLevel: 'info',
};
for (const file of ['index.html', 'windows.css']) {
  await cp(`${root}src/hosts/windows/${file}`, `${outdir}/${file}`);
}
if (process.argv.includes('--serve')) {
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: outdir, host: '127.0.0.1', port: 1420 });
  console.log('Persona desktop frontend ready on port 1420. Restart after HTML/CSS changes.');
} else {
  await esbuild.build(options);
}
