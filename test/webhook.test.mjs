import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createWebhookProxy } from '../scripts/webhook.mjs';
const secret = 'test-only-secret';
const sign = body => createHmac('sha256', secret).update(body).digest('base64');
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function fixture(t, handler) {
  const upstream = http.createServer(handler);
  const upstreamPort = await listen(upstream);
  const proxy = createWebhookProxy({ upstreamPort });
  const port = await listen(proxy);
  t.after(() => { proxy.closeAllConnections(); upstream.closeAllConnections(); proxy.close(); upstream.close(); });
  return `http://127.0.0.1:${port}`;
}
test('raw JSON bytes and signature survive; backend HMAC verification passes', async t => {
  const body = '{ "events": [], "message": "米禮盒" }\n';
  const base = await fixture(t, async (req, res) => {
    const parts = []; for await (const b of req) parts.push(b);
    const raw = Buffer.concat(parts);
    assert.equal(raw.toString(), body);
    assert.equal(req.headers['x-line-signature'], sign(raw));
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
  });
  const response = await fetch(base + '/line/webhook', { method: 'POST', body, headers: { 'x-line-signature': sign(body) } });
  assert.equal(response.status, 200);
});
test('Dashboard, traversal, encoded paths and queries never reach backend', async t => {
  let calls = 0;
  const base = await fixture(t, (req, res) => { calls++; res.end(); });
  for (const path of ['/', '/api/config', '/line/webhook?path=/api', '/line%2fwebhook', '/line/webhook/']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'x-line-signature': 'x' }, body: '{}' });
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls, 0);
});
test('only POST is accepted', async t => {
  const base = await fixture(t, (req, res) => res.end());
  assert.equal((await fetch(base + '/line/webhook')).status, 405);
});
test('missing signature does not reach backend', async t => {
  let calls = 0;
  const base = await fixture(t, (req, res) => { calls++; res.end(); });
  assert.equal((await fetch(base + '/line/webhook', { method: 'POST', body: '{}' })).status, 401);
  assert.equal(calls, 0);
});
test('invalid signature is rejected by backend, not magically accepted by proxy', async t => {
  const base = await fixture(t, async (req, res) => {
    const parts = []; for await (const b of req) parts.push(b);
    res.writeHead(req.headers['x-line-signature'] === sign(Buffer.concat(parts)) ? 200 : 401); res.end();
  });
  assert.equal((await fetch(base + '/line/webhook', { method: 'POST', body: '{}', headers: { 'x-line-signature': 'invalid' } })).status, 401);
});
test('oversized declared body does not reach backend', async t => {
  let calls = 0;
  const base = await fixture(t, (req, res) => { calls++; res.end(); });
  assert.equal((await fetch(base + '/line/webhook', { method: 'POST', body: 'x'.repeat(65537), headers: { 'x-line-signature': 'x' } })).status, 413);
  assert.equal(calls, 0);
});
test('backend failure and durable marker are preserved', async t => {
  const base = await fixture(t, (req, res) => { res.writeHead(503, { 'x-openclaw-delivery-accepted': 'durable' }); res.end('unavailable'); });
  const response = await fetch(base + '/line/webhook', { method: 'POST', body: '{}', headers: { 'x-line-signature': 'x' } });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'unavailable');
  assert.equal(response.headers.get('x-openclaw-delivery-accepted'), 'durable');
});
