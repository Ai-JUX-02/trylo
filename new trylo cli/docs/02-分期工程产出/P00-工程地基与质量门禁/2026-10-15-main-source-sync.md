# Main-source CLI synchronization, 2026-10-15

Phase: P00 engineering gate maintenance. Status: source synchronization.
Owner: Trylo maintainer. Scope: public product/new-CLI source refresh.

Contract: import the reviewed main working-tree fixes and default Desktop
to trylo-v1. Retain explicit external protocol compatibility; do not publish
or bundle the legacy CLI engine. Existing permission, approval and learning
owners are unchanged by the distribution decision.

The main fixes cover reasoning summary extraction, stream lifecycle and
integrity, agent instructions, fallback and one-turn handling. The local
golden trace now requires tool-result name and normalized durationMs fields
already emitted by the synchronized producer. No output, ordering or
negative tampered-trace assertion is weakened.

Evidence: the old golden fails after producer synchronization; the targeted
e2e/golden tests pass after the expectation update. The complete recovery
npm run verify passes all 11 steps (449.01 seconds): 38 contract tests and
3,935 hermetic test names, strict typecheck, architecture boundaries,
transitions, license/SBOM and source scan. The first attempt also exposed
a broken WSL launcher; recovery uses Git Bash only in the child environment.

Review: deterministic expected metadata follows the production contract;
no new runtime layer or dependency is introduced by the golden adjustment.
The staged CLI passes dependency and approval/terminal smoke checks.
Native Desktop and real-provider acceptance remain separate.

See [the synchronization record](../../../../docs/release/MAIN_SOURCE_SYNC_2026_10_15.md)
for scope, retained failures, artifact boundary and rollback evidence.
