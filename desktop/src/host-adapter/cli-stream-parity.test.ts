// @vitest-environment node
import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { StreamTranslator } from './stream-translator';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import type { LoopEvent } from './loop-events';

const legacyTrace = resolve('../docs/fixtures/p08-cli-v1/legacy-read-parity.jsonl');
const current = resolve(process.env.TRYLO_DESKTOP_CLI_ENTRY ?? '../new trylo cli/dist/cmd/trylo/main.js');
const marker = 'PARITY-FILE-CONTENT';

function openai(response: ServerResponse, done: boolean): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const delta = (value: object, finishReason: string | null = null) => response.write(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: value, finish_reason: finishReason }] })}\n\n`);
  delta({ content: done ? 'DONE' : 'Checking proof.' });
  if (!done) delta({ tool_calls: [{ index: 0, id: 'read-proof', type: 'function',
    function: { name: 'read_file', arguments: JSON.stringify({ path: 'proof.txt' }) } }] });
  delta({}, done ? 'stop' : 'tool_calls');
  response.end('data: [DONE]\n\n');
}

async function run(entry: string, args: string[], workspace: string, home: string, stdin: string) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: workspace, windowsHide: true,
    env: { ...process.env, TRYLO_HOME: home, USERPROFILE: home, HOME: home, CLAUDE_CONFIG_DIR: home,
      TRYLO_OPENAI_API_KEY: 'local-parity',
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1,localhost' },
    stdio: ['pipe', 'pipe', 'pipe'] });
  const lines: string[] = [];
  let stderr = '';
  createInterface({ input: child.stdout }).on('line', line => lines.push(line));
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  // Windows helper cold starts approached 20s during the full contract batch.
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const completion = new Promise<void>((resolveValue, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolveValue() : reject(new Error(`CLI ${entry} exited ${code}: ${stderr.slice(-1500)}; output: ${lines.slice(-2).join('\n')}`)));
    });
    child.stdin.end(stdin);
    await completion;
    return lines;
  } finally { clearTimeout(timer); }
}

function visible(events: readonly LoopEvent[]) {
  return {
    // Legacy result frames repeat the final snapshot after the text stream.
    text: [...new Set(events.flatMap(event => event.type === 'text' && !event.partial ? [event.fullText ?? event.preview] : []))],
    // Legacy emits the same call id in both partial and assistant snapshots.
    tools: [...new Map(events.flatMap(event => event.type === 'tool_use' ? [[event.id, event.tool] as const] : [])).values()],
    readback: events.flatMap(event => event.type === 'tool_result' ? [{ ok: event.ok, hasMarker: event.output.includes(marker) }] : []),
    terminal: events.flatMap(event => event.type === 'loop_end' ? [{ isError: event.isError, finalResult: event.finalResult }] : []),
  };
}

it.skipIf(!existsSync(current))('a real new CLI process matches the captured legacy stream in Desktop text, tool result and terminal behavior', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trylo-stream-parity-'));
  const workspace = join(root, 'workspace');
  mkdirSync(workspace);
  writeFileSync(join(workspace, 'proof.txt'), marker);
  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'local-parity' }] }));
      return;
    }
    if (request.url?.includes('/count_tokens')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"input_tokens":10}');
      return;
    }
    let body = '';
    request.on('data', chunk => { body += String(chunk); });
    request.on('end', () => {
      const payload = JSON.parse(body) as { messages?: { role: string; content?: unknown }[] };
      const messages = payload.messages ?? [];
      const done = messages.some(message => message.role === 'tool' || (Array.isArray(message.content) &&
        message.content.some((block: { type?: string }) => block.type === 'tool_result')));
      if (request.url?.includes('/chat/completions')) openai(response, done);
      else { response.writeHead(404); response.end(); }
    });
  });
  await new Promise<void>(resolveValue => server.listen(0, '127.0.0.1', resolveValue));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Parity model did not bind');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const newHome = join(root, 'new-home');
  mkdirSync(newHome);
  try {
    const prompt = 'Read proof.txt and report DONE.';
    const oldWire = readFileSync(legacyTrace, 'utf8').trim().split(/\r?\n/);
    const newWire = await run(current, ['run', '--format', 'stream-json', '--workspace', workspace,
      '--provider', 'openai-compatible', '--endpoint', `${endpoint}/v1/chat/completions`, '--model', 'local-parity', '--ask', 'never', '-'],
      workspace, newHome, prompt);
    const oldAdapter = new StreamTranslator();
    const newAdapter = new TryloV1EventAdapter();
    if (process.env.TRYLO_DESKTOP_PARITY_EVIDENCE) {
      writeFileSync(join(process.env.TRYLO_DESKTOP_PARITY_EVIDENCE, 'legacy-stream.jsonl'), oldWire.join('\n') + '\n');
      writeFileSync(join(process.env.TRYLO_DESKTOP_PARITY_EVIDENCE, 'new-stream.jsonl'), newWire.join('\n') + '\n');
    }
    const expected = { text: ['Checking proof.', 'DONE'], tools: ['Read'], readback: [{ ok: true, hasMarker: true }],
      terminal: [{ isError: false, finalResult: 'DONE' }] };
    expect(visible(oldWire.flatMap(line => oldAdapter.feed(line)))).toEqual(expected);
    expect(visible(newWire.flatMap(line => newAdapter.feed(line)))).toEqual(expected);
    expect(newAdapter.rejectedLines()).toEqual([]);
    const result = newWire.map(line => JSON.parse(line) as Record<string, unknown>).find(frame => frame.type === 'tool_result');
    expect(result).toMatchObject({ name: 'read_file', status: 'succeeded', durationMs: expect.any(Number) });
    expect(readFileSync(join(workspace, 'proof.txt'), 'utf8')).toBe(marker);
    if (process.env.TRYLO_DESKTOP_PARITY_EVIDENCE) {
      writeFileSync(join(process.env.TRYLO_DESKTOP_PARITY_EVIDENCE, 'parity-visible.json'), JSON.stringify(expected, null, 2));
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveValue, reject) => server.close(error => error ? reject(error) : resolveValue()));
    rmSync(root, { recursive: true, force: true });
  }
}, 45_000);
