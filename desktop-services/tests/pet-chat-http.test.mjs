import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { isAbortError, postJson, postSseJson } from '../src/pet-chat/llm-http.mjs';

test('SSE sniffing waits for a data prefix split across transport chunks', async (t) => {
  const encoder = new TextEncoder();
  const chunks = ['d', 'a', 'ta: {"text":"你好"}\r', '\n\r\n', 'data: [DONE]\n\n'];
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(encoder.encode(chunks.shift()));
      else controller.close();
    },
  })));
  const payloads = [];
  const result = await postSseJson('http://local.test', {}, {}, undefined, value => payloads.push(value));
  assert.equal(result.streamed, true);
  assert.deepEqual(payloads, [{ text: '你好' }]);
});

test('SSE transport cancels and unlocks its reader when the payload handler fails', async (t) => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"error":"failed"}\n\n')); },
    cancel() { cancelled = true; },
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  await assert.rejects(postSseJson('http://local.test', {}, {}, undefined, () => { throw new Error('payload failed'); }), /payload failed/);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

for (const stream of [false, true]) {
  test(`caller cancellation after response headers is recognized (${stream ? 'SSE' : 'JSON'})`, { timeout: 5000 }, async (t) => {
    let headersSent;
    const sent = new Promise(resolve => { headersSent = resolve; });
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': stream ? 'text/event-stream' : 'application/json' });
      res.flushHeaders();
      headersSent();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const controller = new AbortController();
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const request = stream ? postSseJson(endpoint, {}, {}, controller.signal, () => {}) : postJson(endpoint, {}, {}, controller.signal);
    await sent;
    // Wait until fetch resolves; the remaining work is a body read.
    await new Promise(resolve => setTimeout(resolve, 30));
    controller.abort();
    await assert.rejects(request, error => isAbortError(error));
  });
}

test('a split plain JSON fallback is still returned and its reader is unlocked', async (t) => {
  const chunks = [' ', '{"text":', '"fallback"}'];
  const body = new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(new TextEncoder().encode(chunks.shift()));
      else controller.close();
    },
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
  assert.deepEqual(await postSseJson('http://local.test', {}, {}, undefined, () => assert.fail('JSON is not an SSE payload')), {
    streamed: false, payloadCount: 0, data: { text: 'fallback' },
  });
  assert.equal(body.locked, false);
});

test('SSE keeps split UTF-8, comments, CRLF frames and a final unterminated frame', async (t) => {
  const bytes = new TextEncoder().encode(': keepalive\r\nid: 1\r\ndata: {"text":"你好"}\r\n\r\ndata: {"text":"end"}');
  let offset = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull(controller) {
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset));
      else controller.close();
    },
  })));
  const received = [];
  const result = await postSseJson('http://local.test', {}, {}, undefined, value => received.push(value));
  assert.equal(result.payloadCount, 2);
  assert.deepEqual(received, [{ text: '你好' }, { text: 'end' }]);
});

for (const stream of [false, true]) {
  test(`body timeouts retain the timeout error contract (${stream ? 'SSE' : 'JSON'})`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
      pull(controller) { controller.error(new DOMException('body timed out', 'TimeoutError')); },
    }), { headers: { 'content-type': stream ? 'text/event-stream' : 'application/json' } }));
    const request = stream ? postSseJson('http://local.test', {}, {}, undefined, () => {}) : postJson('http://local.test', {}, {});
    await assert.rejects(request, error => error.code === 'ETIMEDOUT' && error.message === 'Request timed out');
  });
}
