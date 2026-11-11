import http from 'node:http';
import { pathToFileURL } from 'node:url';
export function createWebhookProxy({ upstreamPort = 18789, upstreamHost = '127.0.0.1', timeout = 10000 } = {}) {
  return http.createServer({ requestTimeout: timeout, headersTimeout: timeout }, (req, res) => {
    const reject = code => { res.writeHead(code, { 'content-type': 'text/plain', 'connection': 'close' }); res.end(http.STATUS_CODES[code]); };
    // Exact raw URL comparison deliberately rejects queries, encoded paths and alternate routes.
    if (req.url !== '/line/webhook') return reject(404);
    if (req.method !== 'POST') return reject(405);
    const signature = req.headers['x-line-signature'];
    if (typeof signature !== 'string' || !signature) return reject(401);
    const declared = req.headers['content-length'];
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65536)) return reject(413);
    const chunks = []; let size = 0, overLimit = false;
    req.on('data', b => {
      if (overLimit) return;
      size += b.length;
      if (size > 65536) { overLimit = true; chunks.length = 0; reject(413); return; }
      chunks.push(b);
    });
    req.on('error', () => { if (!res.writableEnded) reject(400); });
    req.on('end', () => {
      if (overLimit || res.writableEnded) return;
      const body = Buffer.concat(chunks);
      const upstream = http.request({
        host: upstreamHost, port: upstreamPort, path: '/line/webhook', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': body.length, 'x-line-signature': signature }
      }, response => {
        const headers = { 'content-type': response.headers['content-type'] || 'application/json' };
        if (response.headers['x-openclaw-delivery-accepted']) headers['x-openclaw-delivery-accepted'] = response.headers['x-openclaw-delivery-accepted'];
        res.writeHead(response.statusCode || 502, headers);
        response.on('error', () => res.destroy());
        response.pipe(res);
      });
      upstream.setTimeout(timeout, () => upstream.destroy());
      upstream.on('error', () => { if (!res.writableEnded && !res.headersSent) reject(502); else res.destroy(); });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
      // Never parse or stringify the body: the LINE plugin verifies HMAC over these exact bytes.
      upstream.end(body);
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createWebhookProxy({ upstreamHost: process.env.UPSTREAM_HOST || '127.0.0.1', upstreamPort: Number(process.env.UPSTREAM_PORT || 18789) }).listen(8080, '0.0.0.0', () => {
    console.log('Webhook-only proxy on :8080. Keep Dashboard :18789 PRIVATE.');
    console.log('Signature authenticity is checked by the OpenClaw LINE plugin, not this proxy.');
  });
}
