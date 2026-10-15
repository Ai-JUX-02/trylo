// Replay real recorded Work runs through the FULL renderer pipeline
// (consume-frame → event-presenter → work-workflow-reducer) and report what
// the UI would actually be able to show.
//
// This is the measurement harness for the "Work UI vs Code UI" gap: it turns
// "the panel looks empty" into numbers (how many narrations survive, how many
// activities fall into the unclassified `other` bucket, which phases get
// opened).
//
// Run:  node --import ./tests/loader.mjs scripts/replay-recordings.ts

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { consumeFrame, FrameDedupe } from '../src/consume-frame.js';
import { runIdForTask, TaskRegistry } from '../src/task-registry.js';
import {
  classifyToolKind,
  createWorkTurnProjection,
  reduceWorkItem,
} from '../src/work-workflow-reducer.js';
import type { EventFrame } from '../src/control-plane/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '..', 'tests', 'fixtures', 'work-recordings');

interface RawEvent {
  readonly id?: string;
  readonly task_id?: string;
  readonly seq?: number;
  readonly ts?: number;
  readonly type?: string;
  readonly payload?: Record<string, unknown>;
  readonly schema_version?: number;
  readonly event_id?: string;
  readonly status?: string;
  readonly actor?: string;
  readonly step_id?: string;
}

/** Recordings are stored in the daemon's snake_case column shape; the wire
 *  frame is camelCase (see control-plane-methods broadcastToOperators). */
function toFrame(e: RawEvent): EventFrame {
  return {
    type: 'event',
    event: 'task.event',
    payload: {
      taskId: e.task_id ?? '',
      type: e.type ?? '',
      payload: e.payload ?? {},
      timestamp: e.ts ?? 0,
      schemaVersion: e.schema_version ?? 2,
      eventId: e.event_id ?? e.id ?? '',
      seq: e.seq,
      status: e.status,
      actor: e.actor,
      stepId: e.step_id,
    },
  } as unknown as EventFrame;
}

interface ReplayResult {
  readonly file: string;
  readonly rawEvents: number;
  readonly items: number;
  readonly itemKinds: Record<string, number>;
  readonly narrations: number;
  readonly narrationTexts: readonly string[];
  readonly activities: number;
  readonly activityKinds: Record<string, number>;
  readonly otherActivities: number;
  readonly phasesOpened: number;
  readonly terminal: string;
  readonly danglingToolCards: number;
}

function replay(file: string): ReplayResult {
  const raw = JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as {
    readonly taskEvents?: readonly RawEvent[];
    readonly taskGet?: { readonly id?: string };
  };
  const events = Array.isArray(raw.taskEvents) ? raw.taskEvents : [];
  const taskId = String(raw.taskGet?.id ?? 'task');
  const runId = runIdForTask(taskId);

  const registry = new TaskRegistry();
  registry.register({
    taskId,
    runId,
    turnId: `turn:${taskId}`,
    workspaceId: 'ws',
    projectRoot: 'D:/repo',
    conversationId: 'conv',
    sessionId: 'sess',
    status: 'running',
    lastSeq: 0,
    createdAt: 0,
    updatedAt: 0,
    intent: 'task',
  } as never);
  const dedupe = new FrameDedupe();

  let projection = createWorkTurnProjection({
    taskId,
    runId,
    turnId: `turn:${taskId}`,
    conversationId: 'conv',
    intent: 'task',
  });

  let items = 0;
  const itemKinds: Record<string, number> = {};
  for (const e of events) {
    const update = consumeFrame(toFrame(e), { registry, dedupe } as never);
    if (update.kind !== 'accepted') continue;
    for (const item of update.items) {
      items += 1;
      itemKinds[item.kind] = (itemKinds[item.kind] ?? 0) + 1;
      if (item.kind === 'tool') {
        const name = String((item as { tool?: string }).tool ?? '(unnamed)');
        toolNames.set(name, (toolNames.get(name) ?? 0) + 1);
      }
      projection = reduceWorkItem(projection, item as never);
    }
  }

  const activityKinds: Record<string, number> = {};
  for (const a of projection.activities) {
    activityKinds[a.kind] = (activityKinds[a.kind] ?? 0) + 1;
  }
  const dangling = projection.activities.filter(
    (a) => a.toolCallId !== undefined && a.toolMessageId === undefined,
  ).length;

  return {
    file,
    rawEvents: events.length,
    items,
    itemKinds,
    narrations: projection.narrations.length,
    narrationTexts: projection.narrations.map(
      (n) => `[${String(n.phaseId)}] ${n.text.slice(0, 52)}`,
    ),
    phaseSpread: (() => {
      const byPhase = new Map<string, number>();
      for (const n of projection.narrations) {
        const k = String(n.phaseId);
        byPhase.set(k, (byPhase.get(k) ?? 0) + 1);
      }
      return Object.fromEntries(byPhase);
    })(),
    activities: projection.activities.length,
    activityKinds,
    otherActivities: projection.activities.filter((a) => a.kind === 'other').length,
    phasesOpened: projection.phases.length,
    terminal:
      projection.terminal?.kind === 'final_answer'
        ? projection.terminal.text.slice(0, 80)
        : (projection.terminal?.kind ?? '(none)'),
    danglingToolCards: dangling,
  };
}

const files = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

// Tool names as the presenter actually emits them — this is the ground truth
// the classifier must cover.
const toolNames = new Map<string, number>();

let totalRaw = 0;
let totalItems = 0;
let totalNarrations = 0;
let totalActivities = 0;
let totalOther = 0;
let totalDangling = 0;
const grandItemKinds: Record<string, number> = {};
const grandActivityKinds: Record<string, number> = {};

for (const f of files) {
  const r = replay(f);
  totalRaw += r.rawEvents;
  totalItems += r.items;
  totalNarrations += r.narrations;
  totalActivities += r.activities;
  totalOther += r.otherActivities;
  totalDangling += r.danglingToolCards;
  for (const [k, v] of Object.entries(r.itemKinds)) {
    grandItemKinds[k] = (grandItemKinds[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(r.activityKinds)) {
    grandActivityKinds[k] = (grandActivityKinds[k] ?? 0) + v;
  }
  process.stdout.write(
    `${f.padEnd(46)} events=${String(r.rawEvents).padStart(4)} items=${String(r.items).padStart(4)} ` +
      `narr=${String(r.narrations).padStart(2)} acts=${String(r.activities).padStart(3)} ` +
      `other=${String(r.otherActivities).padStart(3)} phases=${r.phasesOpened}\n`,
  );
  // Show the narration content for two representative runs so the retained
  // reasoning can be eyeballed (are these real thoughts, or noise?).
  if (f.startsWith('multi-artifact') || f.startsWith('ppt-review') || f.startsWith('long-run')) {
    process.stdout.write(`    narrations for ${f}:\n`);
    for (const text of r.narrationTexts) {
      process.stdout.write(`      · ${text}\n`);
    }
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));

process.stdout.write('\n=== TOTALS ===\n');
process.stdout.write(`recordings            : ${files.length}\n`);
process.stdout.write(`raw events            : ${totalRaw}\n`);
process.stdout.write(`presenter items       : ${totalItems}\n`);
process.stdout.write(`narrations kept       : ${totalNarrations}\n`);
process.stdout.write(`activities            : ${totalActivities}\n`);
process.stdout.write(`activities kind=other : ${totalOther}  (${pct(totalOther, totalActivities)}%)\n`);
process.stdout.write(`dangling tool cards   : ${totalDangling}\n`);
process.stdout.write(`item kinds            : ${JSON.stringify(grandItemKinds)}\n`);
process.stdout.write(`activity kinds        : ${JSON.stringify(grandActivityKinds)}\n`);
process.stdout.write('\n=== TOOL NAMES (as presenter emits) -> classified kind ===\n');
for (const [name, count] of [...toolNames.entries()].sort((a, b) => b[1] - a[1])) {
  process.stdout.write(
    `${String(count).padStart(4)}  ${name.padEnd(26)} -> ${classifyToolKind(name)}\n`,
  );
}
