import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// WP-0 guard: the work-recordings fixtures are extracted verbatim from the
// local cowork-os.db (see work/scripts/extract-work-recordings.cjs). These
// tests pin the recording shape so downstream work (WP-2 normalizer contract
// tests) can rely on it instead of guessing fields.

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "work-recordings",
);

interface RecordingMeta {
  source: string;
  scenario: string;
  taskId: string;
  status: string;
  terminalStatus: string | null;
  failureClass: string | null;
  eventCount: number;
}

interface RecordingEvent {
  id: string;
  task_id: string;
  seq: number;
  ts: number;
  type: string;
  payload: unknown;
}

interface Recording {
  meta: RecordingMeta;
  taskGet: Record<string, unknown>;
  taskEvents: RecordingEvent[];
}

function loadIndex(): { files: Array<{ file: string; scenario: string }> } {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "index.json"), "utf8"));
}

function loadRecording(file: string): Recording {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8"));
}

describe("WP-0 real recordings fixtures", () => {
  it("index covers at least eight real runs across distinct scenarios", () => {
    const index = loadIndex();
    assert.ok(index.files.length >= 8, `expected >= 8 recordings, got ${index.files.length}`);
    const scenarios = new Set(index.files.map((f) => f.scenario));
    assert.ok(scenarios.size >= 8, "recordings should span distinct scenarios");
  });

  it("every indexed file exists, parses, and carries real-run provenance", () => {
    const index = loadIndex();
    for (const entry of index.files) {
      const rec = loadRecording(entry.file);
      assert.ok(rec.meta.source.includes("cowork-os.db"), `${entry.file}: provenance must cite the real DB`);
      assert.equal(rec.meta.scenario, entry.scenario);
      assert.equal(rec.meta.taskId, rec.taskGet.id);
      assert.equal(rec.taskEvents.length, rec.meta.eventCount);
      assert.ok(!("agent_config" in rec.taskGet), `${entry.file}: agent_config must stay redacted`);
    }
  });

  it("events are seq-ordered, task-scoped, and use the recorded timeline_* vocabulary", () => {
    const knownTypes = new Set([
      "timeline_step_started",
      "timeline_step_updated",
      "timeline_step_finished",
      "timeline_group_started",
      "timeline_group_finished",
      "timeline_artifact_emitted",
      "timeline_error",
    ]);
    const index = loadIndex();
    const seenTypes = new Set<string>();
    for (const entry of index.files) {
      const rec = loadRecording(entry.file);
      let lastSeq = -1;
      for (const ev of rec.taskEvents) {
        assert.ok(knownTypes.has(ev.type), `${entry.file}: unexpected event type ${ev.type}`);
        assert.equal(ev.task_id, rec.meta.taskId);
        assert.ok(ev.seq > lastSeq, `${entry.file}: seq must be strictly increasing`);
        lastSeq = ev.seq;
        seenTypes.add(ev.type);
      }
    }
    // The corpus must exercise steps, groups, artifacts and errors — the
    // four semantic families the WP-2 normalizer has to project.
    for (const family of ["timeline_step_", "timeline_group_", "timeline_artifact_emitted", "timeline_error"]) {
      assert.ok([...seenTypes].some((t) => t.startsWith(family)), `recordings miss event family ${family}`);
    }
  });

  it("corpus spans completed, failed and cancelled terminal outcomes", () => {
    const index = loadIndex();
    const statuses = new Set<string>();
    const failures = new Set<string>();
    for (const entry of index.files) {
      const rec = loadRecording(entry.file);
      statuses.add(rec.meta.status);
      if (rec.meta.failureClass) failures.add(rec.meta.failureClass);
    }
    for (const expected of ["completed", "failed", "cancelled"]) {
      assert.ok(statuses.has(expected), `corpus lacks ${expected} runs`);
    }
    // Real failure classes observed upstream; the resolver must handle them.
    assert.ok(failures.has("budget_exhausted"), "corpus lacks budget_exhausted");
    assert.ok(failures.has("contract_error"), "corpus lacks contract_error");
  });

  it("no stray fixture files outside the index", () => {
    const index = loadIndex();
    const indexed = new Set(index.files.map((f) => f.file));
    indexed.add("index.json");
    indexed.add("README.md");
    for (const name of readdirSync(FIXTURE_DIR)) {
      assert.ok(indexed.has(name), `untracked fixture file: ${name}`);
    }
  });
});
