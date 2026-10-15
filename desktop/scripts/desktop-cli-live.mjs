import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read the selected CLI connection through its owner; no credential is printed or saved.
const cliRoot = resolve('../new trylo cli');
const { createProcessContext } = await import(pathToFileURL(resolve(cliRoot, 'dist/cmd/trylo/main.js')).href);
const { prepareRun } = await import(pathToFileURL(resolve(cliRoot, 'dist/internal/surface/cli/run-command.js')).href);
const context = createProcessContext();
const prepared = await prepareRun(context, { options: { message: [], readStdin: false, format: 'stream-json' },
  permissionMode: 'non_interactive', sink: { stdout() {}, stderr() {} } });
if (!('apiKey' in prepared) || !prepared.apiKey) {
  context.close();
  throw new Error('The selected CLI connection has no usable API credential.');
}
try {
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
    'src/host-adapter/trylo-v1-live-process.test.ts', '-t', 'real configured model'], {
    cwd: resolve('.'), stdio: 'inherit', windowsHide: true,
    env: { ...process.env, TRYLO_DESKTOP_LIVE: '1', TRYLO_DESKTOP_LIVE_ENDPOINT: prepared.endpoint,
      TRYLO_DESKTOP_LIVE_MODEL: prepared.model, TRYLO_DESKTOP_LIVE_KEY: prepared.apiKey,
      TRYLO_DESKTOP_LIVE_EVIDENCE: process.env.TRYLO_DESKTOP_LIVE_EVIDENCE
        ?? resolve(cliRoot, 'docs/02-分期工程产出/P08-Desktop切换与Parity/evidence/2026-10-03-desktop-stdio'),
    },
  });
  process.exitCode = await new Promise((resolveCode, reject) => {
    child.once('error', reject); child.once('exit', code => resolveCode(code ?? 1));
  });
} finally {
  await prepared.close();
  context.close();
}
