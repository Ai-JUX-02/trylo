// Trylo Desktop — accessors for the frozen trylo-v1 golden traces.
//
// The traces themselves live in `docs/fixtures/p08-cli-v1/` and were
// captured from the real CLI on 2026-09-22 (see
// `new trylo cli/docs/02-分期工程产出/P08-Desktop切换与Parity/evidence/2026-09-22-golden-trace/`).
// They are fixtures, not mocks: every assertion in the P08 suite runs
// against bytes the CLI actually emitted.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_DIR = join(__dirname, '../../../docs/fixtures/p08-cli-v1');

/** Non-blank lines of a frozen golden trace. */
export function traceLines(name: string): string[] {
  return readFileSync(join(FIXTURE_DIR, `${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '');
}

/** stderr captured for the same scenario. */
export function traceStderr(name: string): string[] {
  return readFileSync(join(FIXTURE_DIR, `${name}.stderr.txt`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.trim());
}

/** The recorded process exit code (null when the file has none). */
export function traceExitCode(name: string): number | null {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.exit.txt`), 'utf8');
  const m = raw.match(/exit=(-?\d+)/);
  return m ? Number(m[1]) : null;
}

export const TRACE_SUCCESS = '01-success';
export const TRACE_WRITE_TOOL = '02-write-tool';
export const TRACE_DENIED = '03-tool-denied-failed';
export const TRACE_PRERUN_FAILURE = '04-prerun-config-failure';
export const TRACE_CANCELLED = '05-cancelled-no-terminal';
export const TRACE_NO_EOF = '06-no-eof-never-starts';
