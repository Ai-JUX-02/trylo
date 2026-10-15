import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderEvent, ProviderPort } from "../ports/provider.js";
import { consumeProviderStream } from "./stream.js";

/**
 * The released connection (live-machine finding, 2026-09-26).
 *
 * `consumeProviderStream` deliberately stops reading at `finish` — nothing
 * past a terminal signal may become a fact. But *stopping* is not *letting
 * go*: unless the suspended generator is finalized, the adapter never runs
 * its cleanup, and the HTTP connection stays open for the whole turn. A
 * subagent child attempt then becomes the second concurrent connection on
 * the same port, and a single-connection endpoint refuses it with 429.
 */

const FINISH: ProviderEvent = { type: "finish", reason: "stop", rawReason: "stop", requiresFollowUp: false };

function contextOf(port: ProviderPort) {
  let n = 0;
  return {
    port,
    request: { attemptId: "att-1", model: "m", messages: [], tools: [] },
    signal: new AbortController().signal,
    startSequence: 0,
    nextEventId: () => `e${n++}`,
  };
}

test("a generator left suspended at finish is finalized, and no frame past it is ever pulled", async () => {
  const pulls = { afterFinish: 0, finalized: false };
  const port: ProviderPort = {
    async *stream(): AsyncGenerator<ProviderEvent> {
      try {
        yield { type: "text_start", blockId: "b1" };
        yield { type: "text_delta", blockId: "b1", text: "hi" };
        yield { type: "text_end", blockId: "b1" };
        yield FINISH;
        pulls.afterFinish += 1;
        yield { type: "text_start", blockId: "b2" };
      } finally {
        pulls.finalized = true;
      }
    },
  };

  const observation = await consumeProviderStream(contextOf(port));

  assert.equal(observation.sawFinish, true);
  assert.equal(pulls.afterFinish, 0, "finish is terminal: the consumer must pull nothing after it");
  assert.equal(
    pulls.finalized,
    true,
    "the consumer stopped early, so it must release the generator (iterator.return) and let the adapter clean up",
  );
  assert.equal(observation.transcriptItems.length, 1);
});

test("a stream that ends by itself is not disturbed by the release", async () => {
  const pulls = { finalized: false };
  const port: ProviderPort = {
    async *stream(): AsyncGenerator<ProviderEvent> {
      try {
        yield { type: "text_start", blockId: "b1" };
        yield { type: "text_delta", blockId: "b1", text: "ok" };
        yield { type: "text_end", blockId: "b1" };
      } finally {
        pulls.finalized = true;
      }
    },
  };

  const observation = await consumeProviderStream(contextOf(port));

  assert.equal(pulls.finalized, true);
  assert.equal(observation.sawFinish, false);
  assert.equal(observation.transcriptItems.length, 1);
});
