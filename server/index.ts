import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceAccess } from './access';
import { OpenAICompatibleProvider } from './provider';
import { createAgentService } from './service';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Respect the deployment's inherited proxy and CA settings, including loopback exclusions.
setGlobalDispatcher(new EnvHttpProxyAgent());

const directory = resolve(process.env.PERSONA_SERVICE_DATA ?? '.persona-service');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const code = process.env.PERSONA_PAIRING_CODE ?? randomBytes(12).toString('base64url');
writeFileSync(resolve(directory, 'pairing-code.txt'), code, { mode: 0o600 });
const provider = new OpenAICompatibleProvider({ url: process.env.PERSONA_PROVIDER_URL ?? 'https://api.openai.com/v1', key: process.env.PERSONA_API_KEY, model: process.env.PERSONA_MODEL });
const perDay = Number(process.env.PERSONA_DEVICE_DAILY_LIMIT ?? 30);
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(perDay) || perDay < 1 || perDay > 1000 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Limites du serveur invalides.');
const service = createAgentService(provider, new DeviceAccess({ code, directory, perDay }));
service.requestTimeout = 35_000; service.headersTimeout = 10_000;
service.listen(port, process.env.PERSONA_SERVICE_HOST ?? '127.0.0.1', () => {
  console.log(`Service Persona démarré sur le port ${port}. Fournisseur ${provider.configured ? 'configuré' : 'non configuré'}.`);
  console.log(`Code de connexion à usage unique (10 minutes) : ${resolve(directory, 'pairing-code.txt')}`);
});
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { service.close(); service.closeAllConnections(); });
