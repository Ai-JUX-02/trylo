# testdata/settings — fixtures for the configuration-layered-loading package

These fixtures belong to `src/internal/settings/**`, `src/internal/ports/settings.ts`
and `src/internal/adapters/settings-fs.ts` (work package
`2026-09-15-WP-DEEPSEEK-配置分层加载与公开视图.md`).

Nothing under here is compiled or executed directly:

- `architecture/*.ts` — text-only fixtures read by `settings/boundary.test.ts`.
  They are deliberately **not** under `src/`, so `tsc` never sees them. One lists
  imports the boundary scanner must flag; the other lists the only dependency
  directions the package may use and must produce zero hits. A scanner that
  cannot tell these two apart is not evidence.
- `fs/**` — a fake home / workspace / system tree read through the real
  `node:fs` by `adapters/settings-fs.test.ts`, to prove the disk path without
  touching a real user's home directory.

## Secret discipline

No fixture contains a real credential. Keys that must be *refused* (`apiKey`,
`token`, `mcpServers`, …) appear only as obviously-fake values inside in-memory
test maps, never as a real secret on disk. A settings file is not allowed to hold
a secret at all — that is the credentials package's job — so the only secret-shaped
data here is the data used to prove the refusal.
