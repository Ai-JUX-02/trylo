import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_KEYS,
  declaredCapabilities,
  isCapabilityKey,
  isProviderAuthType,
  PROVIDER_AUTH_TYPES,
  renderCapabilities,
  requireCapability,
  supports,
  type ProviderCapabilities,
} from "./capabilities.js";

/**
 * The matrix is only worth having if it can say no. Every case here is either
 * "the declaration is honoured" or "the absence of a declaration is refused" —
 * there is no third outcome in which a capability appears because a caller
 * wanted one.
 */

function caps(partial: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
    models: [],
    streaming: true,
    reasoning: false,
    tools: true,
    cancellation: true,
    auth: "none",
    endpoint: "",
    ...partial,
  };
}

test("the capability vocabulary is closed", () => {
  assert.deepEqual([...CAPABILITY_KEYS], ["streaming", "reasoning", "tools", "cancellation"]);
  assert.equal(isCapabilityKey("vision"), false);
  assert.equal(isCapabilityKey("streaming"), true);
  assert.deepEqual([...PROVIDER_AUTH_TYPES], ["none", "api_key", "oauth"]);
  assert.equal(isProviderAuthType("bearer"), false);
});

test("an undeclared capability is refused, not approximated", () => {
  const denial = requireCapability("fixture", caps(), "reasoning");
  assert.deepEqual(denial, {
    ok: false,
    denial: { code: "unsupported_capability", providerId: "fixture", capability: "reasoning" },
  });
});

test("a declared capability is granted and names its provider", () => {
  assert.deepEqual(requireCapability("fixture", caps(), "streaming"), { ok: true });
  assert.deepEqual(requireCapability("my-endpoint", caps({ reasoning: true }), "reasoning"), {
    ok: true,
  });
});

test("supports reads the declaration and nothing else", () => {
  const value = caps({ streaming: false, tools: false });
  assert.equal(supports(value, "streaming"), false);
  assert.equal(supports(value, "tools"), false);
  assert.equal(supports(value, "cancellation"), true);
  assert.deepEqual(declaredCapabilities(value), ["cancellation"]);
  assert.deepEqual(declaredCapabilities(caps()), ["streaming", "tools", "cancellation"]);
});

test("an empty model list is rendered as not-declared, never as no models", () => {
  const text = renderCapabilities(caps({ auth: "api_key" }));
  assert.match(text, /models=not-declared/);
  assert.match(text, /context=not-declared/);
  assert.match(text, /auth=api_key/);
  assert.match(text, /streaming\|tools\|cancellation/);
});

test("a declared window and models are rendered as facts", () => {
  const text = renderCapabilities(caps({ models: ["a", "b"], contextWindow: 128000 }));
  assert.match(text, /models=a,b/);
  assert.match(text, /context=128000/);
});

test("a declaration with nothing enabled renders none rather than an empty slot", () => {
  const text = renderCapabilities(
    caps({ streaming: false, tools: false, cancellation: false }),
  );
  assert.match(text, /^none /);
});
