// Builds the Chrome extension into dist/extension and the browser playground into dist/playground.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/extension');
const play = join(root, 'dist/playground');
const watch = process.argv.includes('--watch');
const chrome = join(root, 'src/hosts/chrome');

const common = {
  bundle: true,
  target: 'chrome116',
  loader: { '.svg': 'text' },
  legalComments: 'none',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

const builds = [
  { entryPoints: { content: join(chrome, 'content.ts') }, format: 'iife', outdir: out },
  {
    entryPoints: {
      background: join(chrome, 'background.ts'),
      popup: join(chrome, 'popup/popup.ts'),
      options: join(chrome, 'options/options.ts'),
      welcome: join(chrome, 'welcome/welcome.ts'),
    },
    format: 'esm',
    outdir: out,
  },
  { entryPoints: { playground: join(root, 'src/hosts/playground/playground.ts') }, format: 'esm', outdir: play },
];

async function copyStatic() {
  await mkdir(join(out, 'icons'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(chrome, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await cp(join(chrome, '_locales'), join(out, '_locales'), { recursive: true });
  for (const f of ['popup/popup.html', 'popup/popup.css', 'options/options.html', 'options/options.css', 'welcome/welcome.html', 'welcome/welcome.css']) {
    await cp(join(chrome, f), join(out, f.split('/').pop()));
  }
  await cp(join(root, 'assets/icons'), join(out, 'icons'), { recursive: true });
  await cp(join(root, 'src/hosts/playground/index.html'), join(play, 'index.html'));
  await cp(join(root, 'src/hosts/playground/playground.css'), join(play, 'playground.css'));
}

if (!watch) await Promise.all([out, play].map((dir) => rm(dir, { recursive: true, force: true })));
await mkdir(out, { recursive: true });
await mkdir(play, { recursive: true });

if (watch) {
  for (const b of builds) await (await esbuild.context({ ...common, ...b })).watch();
  await copyStatic();
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
  await copyStatic();
  for (const f of ['manifest.json', 'content.js', 'background.js', 'popup.html', 'options.html', 'welcome.html', 'icons/icon-128.png']) {
    if (!existsSync(join(out, f))) throw new Error(`Missing build output: ${f}`);
  }
  console.log(`\nExtension ready: ${out}`);
}
