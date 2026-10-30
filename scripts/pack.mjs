// Zips dist/extension into release/persona-extension-<version>.zip (for the Chrome Web Store or sharing).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
mkdirSync(join(root, 'release'), { recursive: true });
const zip = join(root, 'release', `persona-extension-${version}.zip`);
rmSync(zip, { force: true });
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${join(root, 'dist/extension')}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rq', zip, '.'], { cwd: join(root, 'dist/extension'), stdio: 'inherit' });
}
console.log(`Packed ${zip}`);
