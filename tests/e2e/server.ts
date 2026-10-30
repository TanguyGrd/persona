import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Serves a folder over HTTP with a strict CSP, like many real sites. */
export async function serve(dir: string): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^([/\\])+/, '');
    try {
      const body = await readFile(join(dir, path || 'page.html'));
      res.writeHead(200, {
        'content-type': TYPES[extname(path || 'page.html')] ?? 'application/octet-stream',
        'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections(); }) };
}
