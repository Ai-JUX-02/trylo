// WP-0: extract REAL Work run recordings from the local cowork-os.db into
// test fixtures. Never fabricate fields — everything written here comes
// verbatim from recorded rows.
//
// Usage: node work/scripts/extract-work-recordings.cjs [path/to/cowork-os.db]
//
// Output: work/tests/fixtures/work-recordings/<scenario>-<taskId8>.json
//   { meta, taskGet, taskEvents }
//   - taskGet   = the tasks row (agent_config stripped: may hold API keys)
//   - taskEvents = raw task_events ordered by seq (payload parsed if JSON)
//
// Selection rationale (see docs TRYLO-WORK-END-TO-END-WORKFLOW spec §13):
// the DB contains no approval/input-request/presentation-success runs, so
// those scenarios are honestly marked unavailable in index.json instead of
// being invented.
process.env.NODE_PATH = 'C:/work/demo-ws/work/vendor/cowork-os/node_modules';
require('module').Module._initPaths();
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.argv[2] ?? 'C:/Users/Administrator/.cowork/cowork-os.db';
const OUT_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'work-recordings');

// taskId -> stable scenario slug for the fixture filename.
const SELECTION = [
  ['beac159a-a17a-4c18-94f3-835cfd6b3496', 'chat-completed'],
  ['03a0853f-342a-489a-9100-bfa4d65452a9', 'chat-completed-with-error'],
  ['69507154-2635-4104-8907-e08a3500b0d1', 'file-generation-completed'],
  ['fd0aff13-5a97-4997-a8ed-7b29e9925fbe', 'multi-artifact-completed'],
  ['a1863e32-02af-4f26-b1c8-296518277fc7', 'failed-budget-exhausted'],
  ['3c83083d-dd5b-42ee-b071-fcc6946f858e', 'failed-contract-error'],
  ['d015d89b-c004-4344-8b3d-3088ed18f372', 'failed-unknown'],
  ['fa620ffd-3064-4e19-b58c-c6f655649c82', 'ppt-review-failed'],
  ['e977faa2-7099-40bf-9e0e-f98fe12ccfcc', 'long-run-failed-with-errors'],
  ['bda0ec80-017d-4440-b0f4-78d3b395e9ae', 'cancelled-mid-run'],
  ['c6019b29-70bd-4232-9791-7fc8f52260c7', 'cancelled-early'],
];

const REDACTED_TASK_COLUMNS = ['agent_config'];

const db = new Database(DB_PATH, { readonly: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const columns = db.prepare('pragma table_info("tasks")').all().map((c) => c.name);
const taskCols = columns.filter((c) => !REDACTED_TASK_COLUMNS.includes(c));

const files = [];
for (const [taskId, scenario] of SELECTION) {
  const row = db.prepare(`select ${taskCols.join(', ')} from tasks where id=?`).get(taskId);
  if (!row) {
    console.error(`!! task not found: ${taskId}`);
    continue;
  }
  const events = db
    .prepare(
      `select id, task_id, seq, ts, type, payload, schema_version, event_id, status, step_id, group_id, actor, legacy_type
       from task_events where task_id=? order by seq asc, ts asc`
    )
    .all(taskId);
  for (const ev of events) {
    if (typeof ev.payload === 'string') {
      try {
        ev.payload = JSON.parse(ev.payload);
      } catch {
        /* keep raw string — fidelity over convenience */
      }
    }
  }
  const record = {
    meta: {
      source: 'cowork-os.db (real recorded run)',
      dbFile: DB_PATH,
      extractedAt: new Date().toISOString(),
      scenario,
      taskId,
      status: row.status,
      terminalStatus: row.terminal_status,
      failureClass: row.failure_class,
      eventCount: events.length,
    },
    taskGet: row,
    taskEvents: events,
  };
  const file = `${scenario}-${taskId.slice(0, 8)}.json`;
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(record, null, 1));
  const kb = Math.round(fs.statSync(path.join(OUT_DIR, file)).size / 1024);
  files.push({ file, scenario, taskId, status: row.status, failureClass: row.failure_class ?? null, eventCount: events.length, sizeKb: kb });
  console.log(`wrote ${file} (${events.length} events, ${kb} KB)`);
}

const index = {
  purpose:
    'WP-0 real recordings for the Work redesign spec (docs/TRYLO-WORK-END-TO-END-WORKFLOW-EXPERIENCE-REDESIGN-SPEC-2026-08-29.md §13). Fields are verbatim from cowork-os.db; do not hand-edit.',
  extractedFrom: DB_PATH,
  regeneration: 'node work/scripts/extract-work-recordings.cjs [db-path]',
  redactions: ['tasks.agent_config removed (may contain API keys)'],
  scenariosUnavailableInDb: [
    'approval-blocked run (approvals table: 0 rows)',
    'input-request run (input_requests table: 0 rows)',
    'disconnect-recovery run (not recorded in task_events)',
    'generate_presentation success/fallback (no such events recorded)',
    'full PPT deliverable lifecycle (no successful run recorded)',
  ],
  files,
};
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\nindex.json written with ${files.length} recordings`);
db.close();
