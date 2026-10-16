import assert from "node:assert/strict";
import { test } from "node:test";
import { translateBody } from "./openai-stream.js";

test("a short reasoning network chunk is delivered without waiting for 128 characters or EOF", async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const source = new ReadableStream<Uint8Array>({ start(controller) { body = controller; } });
  body.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"first"},"finish_reason":null}]}\n\n'));
  const stream = translateBody(source, new AbortController().signal);
  assert.equal((await stream.next()).value?.type, "reasoning_start");
  let delivered = false;
  const next = stream.next().then(value => { delivered = true; return value; });
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(delivered, true, "short received reasoning must not stay in the coalescer");
    assert.deepEqual((await next).value, { type: "reasoning_delta", blockId: "reasoning-0", text: "first", redacted: false });
  } finally { body.close(); await next; await stream.return(undefined); }
});
