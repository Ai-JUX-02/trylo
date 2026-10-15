import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NativeBrowserCommand, NativeBrowserRecord } from './native-browser';

const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

async function cdp<T = Record<string, unknown>>(url: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, result?: T) => {
      clearTimeout(timer); socket.close(); error ? reject(error) : resolve(result as T);
    };
    const timer = setTimeout(() => finish(new Error(`CDP ${method} timed out`)), 5000);
    socket.addEventListener('error', () => finish(new Error(`CDP ${method} disconnected`)), { once: true });
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method, params })), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id === 1) finish(message.error ? new Error(message.error.message) : undefined, message.result);
    });
  });
}

/** Real isolated Chromium substitutes only for the native window owner.
 *  Profile resolution, MCP gate, CLI tools and approvals remain production code.
 *  This fixture proves CDP/browser behavior, never WebView2 rendering. */
export async function createNativeBrowserEngine(profile: string, projectRoot: string, conversationId: string) {
  // @ts-expect-error The sidecar's existing local browser probe is JavaScript.
  const { probePlaywrightChromium } = await import('../../../desktop-services/src/tooling/tool-browser-condition.mjs');
  const probe = probePlaywrightChromium();
  if (!probe.ok) throw new Error(probe.detail);
  const executable = ['chrome-win64', 'chrome-win'].map(dir => join(probe.root, probe.build, dir, 'chrome.exe')).find(existsSync);
  if (!executable) throw new Error('Chromium executable missing');
  const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const exited = new Promise<void>(done => child.once('exit', () => done()));
  let spawnError: Error | undefined;
  child.once('error', error => { spawnError = error; });
  let browserUrl: string | undefined;
  const dispose = async () => {
    if (browserUrl && child.exitCode === null) await cdp(browserUrl, 'Browser.close').catch(() => { /* engine may already be closed */ });
    if (child.exitCode === null && !spawnError) {
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null) { child.kill(); await exited; }
    }
  };
  try {
    let port = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Chromium exited ${child.exitCode}`);
      const file = join(profile, 'DevToolsActivePort');
      if (existsSync(file)) {
        const [value, endpoint] = readFileSync(file, 'utf8').trim().split('\n');
        port = Number(value); browserUrl = `ws://127.0.0.1:${port}${endpoint}`; break;
      }
      await delay(100);
    }
    if (!browserUrl) throw new Error('Chromium did not expose CDP');
    const pages = async (): Promise<{ id: string; url: string; webSocketDebuggerUrl: string }[]> =>
      (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((page: { type: string }) => page.type === 'page');
    let first;
    for (let attempt = 0; attempt < 100; attempt++) { first = (await pages())[0]; if (first) break; await delay(50); }
    if (!first) throw new Error('Chromium initial page missing');
    const pageId = first.id, label = 'cli-proof-view', marker = `about:blank#trylo-native-${label}`;
    const scope = JSON.stringify([projectRoot.replaceAll('\\', '/').toLowerCase().replace(/\/$/, ''), conversationId]);
    await cdp(first.webSocketDebuggerUrl, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(globalThis,'__tryloNativeView',{value:${JSON.stringify(label)}});`,
    });
    await cdp(first.webSocketDebuggerUrl, 'Page.navigate', { url: marker });
    const commands: NativeBrowserCommand[] = [];
    return {
      scope, commands,
      async command(command: NativeBrowserCommand): Promise<NativeBrowserRecord> {
        if (command.scope !== scope) throw new Error('Native fixture scope mismatch');
        if (command.operation !== 'ensure' && command.operation !== 'activate') throw new Error(`Unexpected native operation ${command.operation}`);
        commands.push(command);
        return { scope, cdpPort: port, tabs: [{ label, marker }], activeLabel: label };
      },
      async observe() {
        const page = (await pages()).find(page => page.id === pageId);
        if (!page) throw new Error('The hosted page disappeared');
        const result = await cdp<{ result: { value: string } }>(page.webSocketDebuggerUrl, 'Runtime.evaluate', {
          expression: 'JSON.stringify({url:location.href,text:document.body?.innerText ?? ""})', returnByValue: true,
        });
        const screenshot = await cdp<{ data: string }>(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
        return { ...JSON.parse(result.result.value) as { url: string; text: string }, png: Buffer.from(screenshot.data, 'base64') };
      },
      dispose,
    };
  } catch (error) { await dispose(); throw error; }
}
