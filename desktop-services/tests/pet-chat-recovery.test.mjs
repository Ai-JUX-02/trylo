import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createChatStore } from '../src/pet-chat/chat-store.mjs';
import { createDesktopChatCommand } from '../src/pet-chat/chat-command.mjs';

test('a partial chat history write preserves the last committed history', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-chat-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createChatStore(root);
  const saved = [{ role: 'user', text: 'saved history', at: 1 }];
  await store.write(saved);
  const writeFile = fs.writeFile;
  let fail = true;
  t.mock.method(fs, 'writeFile', async (file, data, ...args) => {
    if (fail) {
      fail = false;
      await writeFile(file, String(data).slice(0, 12), ...args);
      throw Object.assign(new Error('injected partial chat write'), { code: 'ENOSPC' });
    }
    return writeFile(file, data, ...args);
  });
  await assert.rejects(store.write([{ role: 'user', text: 'new history', at: 2 }]), /injected partial chat write/);
  assert.deepEqual(await store.read(), saved);
  assert.deepEqual(await fs.readdir(path.dirname(store.filePath)), ['desktop-chat.json']);
  await store.write([{ role: 'assistant', text: 'recovered', at: 3 }]);
  assert.equal((await store.read())[0].text, 'recovered');
});

test('a history storage failure reports chat_error and releases the next chat turn', async () => {
  let writes = 0;
  const events = [];
  const handle = createDesktopChatCommand({ store: {
    read: async () => [],
    write: async () => { if (++writes === 1) throw new Error('injected history storage failure'); return true; },
  } });
  await assert.doesNotReject(handle({ type: 'chat_send', requestId: 'first', text: 'hello' }, value => events.push(value), {}));
  assert.equal(events.at(-1).type, 'chat_error');
  assert.match(events.at(-1).error, /injected history storage failure/);
  await handle({ type: 'chat_send', requestId: 'second', text: 'retry' }, value => events.push(value), {});
  assert.equal(events.some(event => event.type === 'chat_started' && event.requestId === 'second'), true);
  assert.match(events.at(-1).error, /API endpoint is missing/);
});

test('clearing while history is loading cannot resurrect a cancelled user message', async () => {
  let loaded;
  const loading = new Promise(resolve => { loaded = resolve; });
  let history = [{ role: 'assistant', text: 'old answer', at: 1 }];
  const events = [];
  const handle = createDesktopChatCommand({ store: {
    read: () => loading,
    write: async messages => { history = messages; return true; },
  } });
  const sending = handle({ type: 'chat_send', requestId: 'old', text: 'cancelled prompt' }, value => events.push(value), {});
  await handle({ type: 'chat_clear' }, value => events.push(value), {});
  loaded([{ role: 'assistant', text: 'old answer', at: 1 }]);
  await sending;
  assert.deepEqual(history, []);
  assert.equal(events.some(event => event.type === 'chat_started'), false);
});
