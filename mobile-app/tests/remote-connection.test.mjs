import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { connectRemoteGateway } from '../src/remoteConnection.ts';
import { readLatestCachedConversation, saveRemoteConversation } from '../src/remoteCache.ts';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const snapshot = (text = 'current') => ({ device: { id: 'pc' }, agent: { timeline: [] }, sessions: [], projects: [], approvals: [], activeSessionId: 's', conversation: [{ id: text, text }] });
class Socket extends EventTarget {
  static all = [];
  constructor(url) { super(); this.url = url; Socket.all.push(this); }
  close() { this.dispatchEvent(new Event('close')); }
  open() { this.dispatchEvent(new Event('open')); }
  frame(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}
let cleanups;
let restore;
beforeEach(t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  cleanups = [];
  const original = new Map(['window', 'document', 'navigator', 'WebSocket', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  restore = () => { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  const win = new EventTarget();
  win.setTimeout = (...args) => setTimeout(...args);
  win.clearTimeout = (...args) => clearTimeout(...args);
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const storage = new Map();
  for (const [key, value] of Object.entries({ window: win, document: doc, navigator: { onLine: true }, WebSocket: Socket, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  Socket.all = [];
});
afterEach(() => { cleanups.forEach(dispose => dispose()); restore(); });
function start(overrides = {}) {
  const states = [], received = [];
  const dispose = connectRemoteGateway({ baseUrl: 'https://example.test', ticket: async () => ({ ticket: 'one-use' }), snapshot: async () => snapshot(), onSnapshot: value => received.push(value), onState: state => states.push(state), ...overrides });
  cleanups.push(dispose);
  return { states, received, dispose };
}
test('socket open is not connected until the authoritative snapshot is received', async () => {
  const h = start(); await flush();
  Socket.all[0].open();
  assert.deepEqual(h.states, ['connecting']);
  Socket.all[0].frame({ snapshot: {} });
  assert.equal(h.received.length, 0);
  Socket.all[0].frame({ snapshot: snapshot() });
  assert.equal(h.states.at(-1), 'connected');
});
test('failed ticket retries and recovers without a history request', async t => {
  let calls = 0;
  const h = start({ ticket: async () => { if (++calls === 1) throw new Error('offline'); return { ticket: 'new-ticket' }; } });
  await flush(); assert.equal(h.states.at(-1), 'reconnecting');
  t.mock.timers.tick(1600); await flush();
  Socket.all[0].frame({ snapshot: snapshot('recovered') });
  assert.equal(calls, 2); assert.equal(h.states.at(-1), 'connected');
  assert.equal(h.received[0].conversation[0].text, 'recovered');
});
test('a socket that never sends its initial snapshot times out', async t => {
  const h = start(); await flush(); Socket.all[0].open();
  t.mock.timers.tick(12000); await flush();
  assert.equal(h.states.at(-1), 'reconnecting');
  Socket.all[0].frame({ snapshot: snapshot('late') });
  assert.equal(h.received.length, 0);
});
test('foreground recovery rejects frames from the old socket and restores a full snapshot', async () => {
  const h = start(); await flush(); const old = Socket.all[0];
  old.frame({ snapshot: snapshot('before') });
  document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(h.states.at(-1), 'connecting');
  old.frame({ snapshot: snapshot('stale') });
  Socket.all[1].frame({ snapshot: snapshot('after') });
  assert.deepEqual(h.received.map(s => s.conversation[0].text), ['before', 'after']);
});
test('dispose aborts a pending ticket and cannot leak a late socket', async () => {
  let resolveTicket, signal;
  const h = start({ ticket: value => { signal = value; return new Promise(resolve => { resolveTicket = resolve; }); } });
  h.dispose(); assert.equal(signal.aborted, true);
  resolveTicket({ ticket: 'late' }); await flush();
  assert.equal(Socket.all.length, 0);
  window.dispatchEvent(new Event('online')); await flush();
  assert.equal(Socket.all.length, 0);
});
test('offline immediately disables controls; online uses a new ticket and snapshot', async () => {
  const h = start(); await flush(); Socket.all[0].frame({ snapshot: snapshot() });
  navigator.onLine = false; window.dispatchEvent(new Event('offline'));
  assert.equal(h.states.at(-1), 'offline');
  navigator.onLine = true; window.dispatchEvent(new Event('online')); await flush();
  assert.equal(h.states.at(-1), 'connecting');
  Socket.all[1].frame({ snapshot: snapshot('online') });
  assert.equal(h.states.at(-1), 'connected');
});
test('a delayed health snapshot never rolls back a newer event', async t => {
  let resolveProbe;
  const h = start({ snapshot: () => new Promise(resolve => { resolveProbe = resolve; }) });
  await flush(); Socket.all[0].frame({ snapshot: snapshot('initial') });
  t.mock.timers.tick(25000); await flush();
  Socket.all[0].frame({ snapshot: snapshot('newest') });
  resolveProbe(snapshot('old')); await flush();
  assert.deepEqual(h.received.map(s => s.conversation[0].text), ['initial', 'newest']);
});
test('half-open connections fail a health deadline and reconnect', async t => {
  const h = start({ snapshot: () => new Promise(() => {}) });
  await flush(); Socket.all[0].frame({ snapshot: snapshot() });
  t.mock.timers.tick(25000); await flush();
  t.mock.timers.tick(12000); await flush();
  assert.equal(h.states.at(-1), 'reconnecting');
});
test('a delayed health snapshot cannot roll back a newer streamed chat event', async t => {
  let resolveProbe;
  const events = [];
  const h = start({
    snapshot: () => new Promise(resolve => { resolveProbe = resolve; }),
    onChatEvent: event => events.push(event),
  });
  await flush();
  Socket.all[0].frame({ snapshot: snapshot('initial') });
  t.mock.timers.tick(25000); await flush();
  Socket.all[0].frame({ type: 'action_event', action: 'chat', payload: { type: 'text-delta', delta: 'new text' } });
  resolveProbe(snapshot('old')); await flush();
  assert.equal(events.length, 1);
  assert.deepEqual(h.received.map(value => value.conversation[0].text), ['initial']);
});
test('offline cache belongs to its paired computer even when session ids match', () => {
  const message = text => [{ id: text, text, role: 'assistant', at: Date.now() }];
  saveRemoteConversation('same-session', 'A', message('from A'), 'pc-A');
  saveRemoteConversation('same-session', 'B', message('from B'), 'pc-B');
  assert.equal(readLatestCachedConversation('pc-A').messages[0].text, 'from A');
  assert.equal(readLatestCachedConversation('pc-B').messages[0].text, 'from B');
  assert.equal(readLatestCachedConversation('pc-C'), null);
  assert.equal(readLatestCachedConversation(), null);
});

test('non-object WebSocket messages are ignored without breaking later snapshots', async t => {
  // Capture the callback directly so browser-dispatched exceptions cannot be
  // hidden by EventTarget's asynchronous error reporting in this Node fixture.
  const addEventListener = Socket.prototype.addEventListener;
  t.mock.method(Socket.prototype, 'addEventListener', function (type, listener, ...args) {
    if (type === 'message') this.receive = listener;
    else addEventListener.call(this, type, listener, ...args);
  });
  const h = start(); await flush();
  const socket = Socket.all[0];
  for (const value of [null, false, 1, 'unexpected', []]) {
    assert.doesNotThrow(() => socket.receive({ data: JSON.stringify(value) }));
  }
  socket.receive({ data: JSON.stringify({ snapshot: snapshot('after malformed frame') }) });
  assert.equal(h.states.at(-1), 'connected');
  assert.equal(h.received[0].conversation[0].text, 'after malformed frame');
});

test('damaged offline cache entries are ignored and cached messages are sanitized', () => {
  localStorage.setItem('trylo.remote.cache.v1', JSON.stringify({
    broken: { sessionId: 'bad', deviceId: 'pc', at: 100, messages: null },
    valid: { sessionId: 'good', deviceId: 'pc', workspace: 'repo', at: 1,
      messages: [null, { role: 'assistant', text: '', attachments: [null] },
        { id: 'm', role: 'assistant', text: 'saved reply', at: 1, attachments: 'invalid' }] },
  }));
  const cached = readLatestCachedConversation('pc');
  assert.equal(cached.sessionId, 'good');
  assert.deepEqual(cached.messages, [{ id: 'm', role: 'assistant', text: 'saved reply', at: 1 }]);
});
