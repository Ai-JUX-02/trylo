import assert from "node:assert/strict";
import test from "node:test";
import { bindVerbs, type PortDeps } from "./verbs.js";
import { createMemoryLedgerStore } from "../adapters/credentials/memory-ledger-store.js";
import { generateAccountId } from "./ids.js";
import { CREDENTIAL_ACCOUNT_ID_PATTERN } from "../ports/credentials.js";

/**
 * Injected clock and id source (WP §2.1, §A7).
 *
 * Two properties the package must hold, both easy to lose by reaching for
 * `Date.now()` or `crypto.randomUUID()` directly:
 *
 *  - a record's `createdAt`/`updatedAt` come from the injected clock, so a test
 *    can name an exact timestamp and a replay is deterministic;
 *  - generated account ids satisfy the port's own pattern, so a future edit to
 *    either side cannot make generated ids invalid without a red test.
 */

const TWO_O_CLOCK = "2030-01-02T03:04:05.000Z";

function portWithClock(now: () => string): { port: ReturnType<typeof bindVerbs> } {
  const deps: PortDeps = {
    store: createMemoryLedgerStore(),
    env: {},
    now,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-00000000abcd" },
    hasProject: false,
  };
  return { port: bindVerbs(deps) };
}

test("record timestamps come from the injected clock, not the wall clock", () => {
  const { port } = portWithClock(() => TWO_O_CLOCK);
  const result = port.login({ providerId: "openai-compatible", secret: "sk-x" });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.createdAt : "", TWO_O_CLOCK);
  assert.equal(result.ok ? result.value.updatedAt : "", TWO_O_CLOCK);
});

test("a generated account id matches the port's own pattern", () => {
  const id = generateAccountId({ randomUUID: () => "abcdef01-2345-4678-89ab-cdef01234567" });
  assert.equal(CREDENTIAL_ACCOUNT_ID_PATTERN.test(id), true);
  // Hyphens stripped, length within the 64-char cap.
  assert.equal(id.includes("-"), false);
  assert.equal(id.length <= 64, true);
});

test("a generated id is accepted by a login that omits accountId", () => {
  const { port } = portWithClock(() => TWO_O_CLOCK);
  const result = port.login({ providerId: "openai-compatible", secret: "sk-x" });
  assert.equal(result.ok, true);
  assert.equal(CREDENTIAL_ACCOUNT_ID_PATTERN.test(result.ok ? result.value.accountId : "BAD"), true);
});

test("an invalid explicit account id is refused before anything is written", () => {
  const { port } = portWithClock(() => TWO_O_CLOCK);
  const result = port.login({ providerId: "openai-compatible", accountId: "Not Valid!", secret: "sk-x" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.code : "", "invalid_account_id");
});
