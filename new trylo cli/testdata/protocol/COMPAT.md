# Protocol JSON compatibility (WP-A)

Canonical owner: `src/internal/protocol/envelope.ts`.

- `protocolVersion` currently `0.0`. Unknown extra fields are ignored at parse.
- Unknown `kind` values parse successfully and are `ignored_unknown_kind` at consume. `observation` is a known kind.
- `producerId` / `producerSequence` are top-level. Nested `producer` objects are not part of v0.0.
- Terminal `payload.reason` is `completed | failed | cancelled | unknown`. `verified` is never a terminal reason.
- Payload size cap: 65536 bytes. Oversize is `payload_too_large`, not truncated.
- Late facts after terminal are new events (`observation` / `check_result`), never mutations of the terminal envelope.
