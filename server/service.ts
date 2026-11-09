import { createServer, type IncomingMessage } from 'node:http';
import { validateModelRequest, validateModelReply } from '../src/core/agent/protocol';
import type { DeviceAccess } from './access';
import type { ModelProvider } from './provider';

async function body(request: IncomingMessage) {
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 64_000) throw new Error('Requête trop grande.');
    text += decoder.decode(part, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export function createAgentService(provider: ModelProvider, access: DeviceAccess) {
  const active = new Set<string>();
  const attempts = new Map<string, { count: number; since: number }>();
  return createServer(async (request, response) => {
    const send = (status: number, value: unknown) => { if (!response.destroyed) response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(JSON.stringify(value)); };
    // The native host is the client. No browser CORS access, cookies, or public web enrollment.
    if (request.headers.origin || request.headers['sec-fetch-site']) { send(403, { error: 'Accès réservé à l’application Persona.' }); return; }
    if (request.method === 'GET' && request.url === '/health') { send(200, { configured: provider.configured }); return; }
    if (request.method === 'POST' && request.url === '/v1/pair') {
      const key = request.socket.remoteAddress ?? 'unknown', now = Date.now();
      for (const [ip, value] of attempts) if (now - value.since > 60_000) attempts.delete(ip);
      if (attempts.size >= 512 && !attempts.has(key)) { send(429, { error: 'Réessayez plus tard.' }); return; }
      const attempt = attempts.get(key) ?? { count: 0, since: now };
      attempts.set(key, attempt);
      if (++attempt.count > 5) { send(429, { error: 'Trop de tentatives de connexion.' }); return; }
      try { const input = await body(request); send(200, { token: access.pair(input.code) }); }
      catch { send(400, { error: 'Code de connexion incorrect, expiré ou déjà utilisé.' }); }
      return;
    }
    const device = access.authenticate(request.headers.authorization);
    if (!device) { send(401, { error: 'Connectez cet appareil au service Persona.' }); return; }
    if (request.method === 'POST' && request.url === '/v1/disconnect') { access.revoke(device); send(200, { disconnected: true }); return; }
    if (request.method === 'GET' && request.url === '/v1/status') {
      send(200, { state: provider.configured ? 'ready' : 'notConfigured', detail: provider.configured ? 'Service Persona configuré.' : 'Le fournisseur IA reste à connecter côté serveur.' }); return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/step') { send(404, { error: 'Route introuvable.' }); return; }
    if (!provider.configured) { send(503, { error: 'Le fournisseur IA reste à connecter côté serveur.' }); return; }
    if (active.has(device) || active.size >= 4) { send(429, { error: 'Une tâche est déjà en cours. Réessayez ensuite.' }); return; }
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', abort); response.once('close', abort);
    active.add(device);
    try {
      let input;
      try { input = validateModelRequest(await body(request)); }
      catch { send(400, { error: 'Conversation invalide ou trop grande.' }); return; }
      try { access.reserve(device); }
      catch (error) { send(429, { error: (error as Error).message }); return; }
      const reply = validateModelReply(await provider.complete(input, controller.signal));
      send(200, reply);
    } catch (error) {
      if (!controller.signal.aborted) send(502, { error: error instanceof Error ? error.message : 'Le fournisseur IA a échoué.' });
    } finally {
      active.delete(device); request.off('aborted', abort); response.off('close', abort);
    }
  });
}
