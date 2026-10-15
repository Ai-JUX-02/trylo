import assert from "node:assert/strict";
import test from "node:test";
import { chatContentOf, responsesContentOf } from "./image-attachments.js";
import type { ProviderImageAttachment } from "../../ports/media.js";

/**
 * WP19.1 wire contract: text-only messages serialize exactly as before (the
 * compatibility half), and an attached image becomes the wire's own image
 * part with the payload intact (the consumption half).
 */

const ATTACHMENT: ProviderImageAttachment = {
  mediaType: "image/png",
  dataBase64: "iVBORw0KGgo=",
  bytes: 8,
  detail: "high",
  width: 1,
  height: 1,
};

test("absent or empty attachments are identity: the old string goes out", () => {
  assert.equal(chatContentOf("hello", undefined), "hello");
  assert.equal(chatContentOf("hello", []), "hello");
  assert.equal(responsesContentOf("hello", undefined), "hello");
  assert.equal(responsesContentOf("hello", []), "hello");
});

test("chat wire carries text first, then one image_url part per attachment", () => {
  const parts = chatContentOf("see this", [ATTACHMENT]);
  assert.deepEqual(parts, [
    { type: "text", text: "see this" },
    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=", detail: "high" } },
  ]);
});

test("responses wire carries input_text then input_image with the same payload", () => {
  const parts = responsesContentOf("see this", [{ ...ATTACHMENT, detail: "original" }]);
  assert.deepEqual(parts, [
    { type: "input_text", text: "see this" },
    { type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo=", detail: "original" },
  ]);
});
