import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDENTIAL_ENV_TABLE,
  DECLARED_ENV_NAMES,
  envVarFor,
  isDeclaredEnvName,
  readDeclaredEnv,
} from "./env-table.js";

/**
 * The declared environment table is the *only* way a credential enters from the
 * environment, so these tests pin three things:
 *
 *  - the exact table contents (adding a variable is a deliberate edit, not an
 *    accident);
 *  - the two-names-one-provider precedence rule (`TRYLO_OPENAI_API_KEY` beats
 *    `TRYLO_API_KEY`, WP §2.4);
 *  - that an undeclared name is invisible even when the snapshot contains it
 *    (adversarial #9 — `AWS_SECRET_ACCESS_KEY` must never be read).
 */

test("the table declares exactly the two TRYLO variables", () => {
  assert.deepEqual(
    CREDENTIAL_ENV_TABLE.map((entry) => entry.env),
    ["TRYLO_API_KEY", "TRYLO_OPENAI_API_KEY"],
  );
  assert.deepEqual([...DECLARED_ENV_NAMES].sort(), ["TRYLO_API_KEY", "TRYLO_OPENAI_API_KEY"]);
});

test("provider-scoped variable wins over the generic one (same provider)", () => {
  assert.equal(envVarFor("openai-compatible"), "TRYLO_OPENAI_API_KEY");
  assert.equal(envVarFor("fixture"), undefined);
});

test("readDeclaredEnv returns the winning variable's value", () => {
  const hit = readDeclaredEnv(
    {
      TRYLO_API_KEY: "generic-key",
      TRYLO_OPENAI_API_KEY: "provider-key",
    },
    "openai-compatible",
  );
  assert.deepEqual(hit, { env: "TRYLO_OPENAI_API_KEY", value: "provider-key" });
});

test("readDeclaredEnv falls back to the generic variable when the specific one is unset", () => {
  const hit = readDeclaredEnv({ TRYLO_API_KEY: "generic-key" }, "openai-compatible");
  assert.deepEqual(hit, { env: "TRYLO_API_KEY", value: "generic-key" });
});

test("an empty declared variable counts as unset", () => {
  assert.equal(readDeclaredEnv({ TRYLO_API_KEY: "" }, "openai-compatible"), undefined);
});

test("an undeclared variable is never read, even when present (adversarial #9)", () => {
  const env = { AWS_SECRET_ACCESS_KEY: "sk-should-never-be-read", TRYLO_OTHER: "nope" };
  assert.equal(isDeclaredEnvName("AWS_SECRET_ACCESS_KEY"), false);
  assert.equal(readDeclaredEnv(env, "openai-compatible"), undefined);
  assert.equal(readDeclaredEnv(env, "fixture"), undefined);
});

test("fixture has no environment variable (it is keyless)", () => {
  assert.equal(envVarFor("fixture"), undefined);
  assert.equal(readDeclaredEnv({ TRYLO_FIXTURE_KEY: "x" }, "fixture"), undefined);
});
