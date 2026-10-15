---
name: trylo-code-quality
description: Use for every Trylo CLI implementation, refactor, code review, test change, protocol change, or dependency adoption. Enforces readability and maintainability as the first release gate, plus architecture, evidence, and permissive-license checks. Do not use for prose-only discussion outside the new Trylo CLI project.
---

# Trylo Code Quality Gate

Treat readability and maintainability as release-blocking requirements.

## Before changing code

1. Read the nearest `AGENTS.md`, `docs/README.md`, the quality discipline, the dependency policy, and the current phase specification.
2. State the behavior contract, affected boundaries, invariants, failure modes, and verification plan.
3. Inspect adjacent implementation and tests. Reuse an existing concept only when it has the same semantics and lifecycle owner.
4. Reject scope that bypasses the current phase exit criteria or creates a second source of truth.

## While designing

1. Keep the core dependent on ports and canonical contracts, never on provider, storage, terminal, Desktop, or UI event details.
2. Give every contractually observable state transition one owner and one canonical event; learning persistence still obeys the collection and retention policy.
3. Prefer small cohesive modules, explicit names, immutable inputs, typed/result-style failures, and pure transformations at boundaries.
4. Replace boolean combinations with explicit states. Make cancellation, timeout, retry, partial delivery, and stale-generation behavior visible.
5. Do not encode an unapproved learning architecture. Until `ADR-L01` is approved, keep P00 contracts learning-neutral and treat frozen plans, method guards, observation sinks, and learning-driven verification as competing design hypotheses rather than requirements.
6. Keep the core PermissionGate independent from every learning hypothesis. Learning can never grant permission or initiate approval; any proposed learned blocker or repair power requires an explicit product decision and contract test.
7. Do not add a dependency until its runtime/development closure, final-artifact placement, A–E architecture tier, notice obligations, type leakage, and replacement path pass the project's license policy. Apache-2.0 is allowed in approved non-core tiers and is not an automatic failure.

## While implementing

1. Keep functions at one level of abstraction and extract policy from mechanics.
2. Comment intent, invariants, protocol quirks, and non-obvious tradeoffs; do not narrate obvious syntax.
3. Avoid hidden global state, ambient mutable configuration, implicit retries, catch-all errors, unbounded queues, and time-dependent tests.
4. Every `catch` needs a terminal branch — rethrow, a typed failure, or a comment stating the cleanup contract. An `instanceof`-narrowed catch that lets other exception types vanish is structurally legal error-swallowing (the 2026-09 mcp-http incident); check siblings for drift and extract shared failure vocabulary instead of writing it twice.
5. Ambient sources (clock, randomness, process surfaces) appear only as injection-seam defaults (`options.now ?? Date.now`) or in gate-allowlisted files; `as unknown as` only at allowlisted persistence boundaries — verify step 3 rejects the rest.
6. Validate all external input at the boundary and convert it once into canonical domain values; persistence read boundaries validate payload shapes at runtime (guard + fail-closed), never a blind cast.
7. Preserve causal identifiers, version hashes, cancellation tokens, and terminal states across adapters.
8. Add tests at the lowest meaningful layer. Use contract and integration tests for process, provider, protocol, persistence, and recovery boundaries. A new regression test must have been shown red against the unfixed code.

## Mandatory self-review

Review the diff in this order and report findings even when the list is empty:

1. Readability: can a new maintainer explain control flow, state ownership, and failure behavior without reconstructing intent?
2. Maintainability: is there one extension point, no duplication of policy, and no speculative abstraction?
3. Architecture: are dependency directions and loop/periphery boundaries intact?
4. Correctness: do success, failure, cancellation, retry, timeout, and stale events satisfy the contract?
5. Safety: can learned policy or model output expand permissions or bypass approval?
6. Supply chain: are exact versions, source provenance, and the transitive license closure acceptable?
7. Evidence: do checks prove the behavior instead of merely executing code?

## Stop conditions

Do not mark work complete when any of the following holds:

- a public contract changed without a compatibility decision and contract test;
- a new dependency lacks a recorded transitive-license decision;
- a file owns unrelated responsibilities because splitting it was deferred;
- a test asserts implementation details while the externally visible invariant remains untested;
- success is inferred from process exit or agent self-report without the required verification;
- documentation and phase evidence are missing.

## Required handoff

Report changed contracts, architectural impact, checks run, evidence locations, remaining risks, and whether the readability/maintainability gate passed. Put durable records under the current phase folder in `docs/02-分期工程产出/`.
