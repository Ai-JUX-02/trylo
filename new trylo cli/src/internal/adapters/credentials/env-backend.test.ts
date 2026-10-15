import assert from "node:assert/strict";
import test from "node:test";
import { createEnvBackend } from "./env-backend.js";

/**
 * The read-only environment backend (WP §2.4).
 *
 * The backend must resolve only declared variables and must have no way to
 * write. The read-only guarantee is structural — the type exposes no `set` — so
 * the test asserts the *resolution* behaviour and the absence of any mutator on
 * the returned object, which is what a future edit would have to break first.
 */

test("the env backend resolves a declared variable", () => {
  const backend = createEnvBackend({ TRYLO_API_KEY: "sk-env" });
  assert.equal(backend.kind, "env");
  const hit = backend.resolve("openai-compatible");
  assert.equal(hit?.secret, "sk-env");
  assert.equal(hit?.accountId, "env");
  assert.equal(hit?.env, "TRYLO_API_KEY");
});

test("the env backend ignores undeclared and unset variables", () => {
  const backend = createEnvBackend({ AWS_SECRET_ACCESS_KEY: "sk-invisible", TRYLO_API_KEY: "" });
  assert.equal(backend.resolve("openai-compatible"), undefined);
  assert.equal(backend.resolve("fixture"), undefined);
});

test("the env backend exposes no mutator (read-only by shape)", () => {
  const backend = createEnvBackend({ TRYLO_API_KEY: "sk-env" }) as Record<string, unknown>;
  for (const mutator of ["set", "delete", "write", "clear"]) {
    assert.equal(mutator in backend, false, `env backend must not expose ${mutator}`);
  }
});

test("the provider-specific variable wins through the backend too", () => {
  const backend = createEnvBackend({ TRYLO_API_KEY: "generic", TRYLO_OPENAI_API_KEY: "specific" });
  assert.equal(backend.resolve("openai-compatible")?.secret, "specific");
  assert.equal(backend.resolve("openai-compatible")?.env, "TRYLO_OPENAI_API_KEY");
});
