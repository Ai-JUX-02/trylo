# Execution loop CLI scenarios

`trylo run --scenario <name>` writes NDJSON envelopes to stdout.

| name | expected terminal | distinct facts |
| --- | --- | --- |
| ordinary-stream | completed | text then terminal |
| tool-approve | completed | approval_requested, tool_result |
| approval-deny | failed | permission_denied, not user_cancel |
| tool-fail-repair | completed | tool_result status=failed then text |
| streaming-cancel | cancelled | user_cancel |
| transport-unknown | unknown | not failed |
| retry-new-attempt | completed | api_retry, two attempts |
| completed-unverified | completed | verification fail observation |
