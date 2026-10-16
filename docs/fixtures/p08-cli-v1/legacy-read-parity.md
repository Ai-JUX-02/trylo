# Legacy read-file stream baseline

Captured on Windows on 2026-10-15 from the real `trylo cli/cli.js` subprocess against a local Anthropic SSE server. The CLI read a real temporary `proof.txt` containing `PARITY-FILE-CONTENT`, then answered `DONE`. The raw JSONL is copied unchanged from the successful capture under `new trylo cli/docs/02-分期工程产出/P08-Desktop切换与Parity/evidence/2026-10-15-stream-integrity/parity-baseline/legacy-stream.jsonl`.

The live old/new capture passed Desktop text, tool readback and terminal comparisons; its deliberate baseline regression failed because the older new-CLI bundle lacked `tool_result.name/durationMs`. Repeated legacy startup probes also timed out and are retained in the same evidence directory. The stable regression therefore compares this captured legacy trace against a real new-CLI subprocess, without requiring the legacy runtime to boot on every test run.

Only local test credentials were used. Tests compare visible semantics, normalize repeated snapshots of the same tool id, and retain distinct calls. Session ids, timestamps and temporary absolute paths in the raw capture are not used as expected values.
