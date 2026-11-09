import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Device { hash: string; day: string; requests: number }
interface Registry { devices: Device[]; usedPairingCodes: string[] }
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));

/** Pilot enrollment and bounded usage. Provider credentials never enter this registry. */
export class DeviceAccess {
  private registry: Registry;
  private pairedAt: number;
  constructor(private options: { code: string; directory?: string; perDay?: number; now?: () => number }) {
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(options.code)) throw new Error('Le code de connexion doit contenir au moins 12 caractères.');
    this.pairedAt = this.now();
    const path = options.directory && join(options.directory, 'devices.json');
    this.registry = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { devices: [], usedPairingCodes: [] };
    if (!Array.isArray(this.registry.devices) || !Array.isArray(this.registry.usedPairingCodes) || this.registry.devices.some((device) => !device || !/^[a-f0-9]{64}$/.test(device.hash) || typeof device.day !== 'string' || !Number.isSafeInteger(device.requests) || device.requests < 0) || this.registry.usedPairingCodes.some((code) => !/^[a-f0-9]{64}$/.test(code))) throw new Error('Registre de connexion invalide.');
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private save() {
    if (!this.options.directory) return;
    mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
    const path = join(this.options.directory, 'devices.json');
    writeFileSync(`${path}.tmp`, JSON.stringify(this.registry), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }
  pair(code: unknown): string {
    const codeHash = hash(this.options.code);
    if (typeof code !== 'string' || code.length > 80 || !equal(code, this.options.code) || this.now() - this.pairedAt > 10 * 60_000 || this.registry.usedPairingCodes.includes(codeHash)) throw new Error('Code incorrect, déjà utilisé ou expiré.');
    if (this.registry.devices.length >= 100) throw new Error('Limite des appareils atteinte.');
    const token = `persona_${randomBytes(32).toString('base64url')}`;
    this.registry.devices.push({ hash: hash(token), day: '', requests: 0 });
    this.registry.usedPairingCodes.push(codeHash);
    this.save();
    return token;
  }
  authenticate(header?: string): string | undefined {
    if (!header?.startsWith('Bearer ') || header.length > 128) return;
    const candidate = hash(header.slice(7));
    return this.registry.devices.find((device) => timingSafeEqual(Buffer.from(device.hash), Buffer.from(candidate)))?.hash;
  }
  reserve(deviceId: string) {
    const device = this.registry.devices.find((device) => device.hash === deviceId);
    if (!device) throw new Error('Appareil non connecté.');
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (device.day !== day) { device.day = day; device.requests = 0; }
    if (device.requests >= (this.options.perDay ?? 30)) throw new Error('Quota quotidien du service atteint.');
    // Reserve before contacting the provider. An interrupted request may still cost tokens.
    device.requests++; this.save();
  }
  revoke(deviceId: string) { this.registry.devices = this.registry.devices.filter((device) => device.hash !== deviceId); this.save(); }
}
