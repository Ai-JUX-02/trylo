import assert from "node:assert/strict";
import test from "node:test";
import { createJournal } from "./index.js";

test("constraint 5: collect=false projection is empty and cannot steal from the run log", () => {
  const journal = createJournal();
  journal.record({ eventId: "e1", kind: "turn_end" });
  journal.record({ eventId: "e2", kind: "tool_result" });
  assert.deepEqual(journal.project({ collect: false }), []);
  assert.equal(journal.project({ collect: true }).length, 2);
});
