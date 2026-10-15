# CLI vendor source restoration, 2026-10-15

Status: archived source audit record. Phase: P00 engineering gate maintenance.
Owner: Trylo maintainer. Decision: publish current product/new CLI source from
an isolated copy and repair omitted build/source inputs.

Contract: restore the existing delayed Windows persistent-CA module and the
sandbox schema declaration referenced by the already-public vendor files.
No implementation, dependency, capability, permission or learning change.
The existing execution-only copy closure remains; node-forge/TLS inspection
is not added. Existing vendor LICENSE, PATCHES and provenance remain authoritative.

Verification: all 11 `npm run verify` steps passed in the public candidate
(234.01s): 38 contract tests, 3,923 hermetic test names, strict TypeScript,
architecture, license/SBOM and source checks. Three native helper build inputs
were staged locally only after matching their provenance hashes.

The new repository source gate rejected omission of each restored file before
returning green with the files present. Readability and maintainability review:
byte-preserving restoration, no duplicate implementation or new lifecycle owner.

Full product/native acceptance remains separate. See
[the source audit](../../../../docs/release/SOURCE_COMPLETENESS_2026_10_15.md)
for all evidence categories, known browser/test failures and rollback scope.
