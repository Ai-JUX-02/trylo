/**
 * A bounded, cursor-driven buffer for one session's output.
 *
 * Two properties matter more than speed here:
 *
 *  - **It says when it dropped something.** Output that vanishes silently reads
 *    as "the program printed nothing", which is a different fact from "the
 *    program printed more than we kept". Only `dropped` tells them apart, and
 *    callers surface it.
 *  - **Reads are cursors, not replays.** Every read returns what arrived since
 *    the last one, so polling a live session cannot cost more than the output
 *    itself. A caller that wants the beginning keeps it, or asks again after a
 *    restart, rather than silently getting the tail forever.
 *
 * Bytes are held, not characters: a program that emits half a multi-byte
 * character must not have that half decoded into a replacement character at an
 * arbitrary place.
 */

export type BufferRead = {
  readonly text: string;
  /** Bytes were discarded to stay inside the cap. */
  readonly dropped: boolean;
  /** Bytes still held that this read did not return (the cap cut the read). */
  readonly heldBack: number;
};

export type BoundedBuffer = {
  write(chunk: Buffer): void;
  /** Everything since the previous read, capped to `maxReadBytes`. */
  read(maxReadBytes: number): BufferRead;
  readonly byteLength: number;
  readonly dropped: boolean;
  /** Forget the cursor and everything before it. */
  reset(): void;
};

export function createBoundedBuffer(maxBytes: number): BoundedBuffer {
  const cap = Math.max(1, Math.trunc(maxBytes));
  // One growing buffer plus one compacted copy. A long session that never reads
  // would otherwise keep shifting bytes forever inside a single array.
  let held: Buffer = Buffer.alloc(0);
  let cursor = 0;
  let dropped = false;

  const compact = (): void => {
    if (cursor === 0) {
      return;
    }
    held = held.subarray(cursor);
    cursor = 0;
  };

  return {
    write(chunk: Buffer): void {
      if (chunk.length === 0) {
        return;
      }
      held = held.length === 0 ? Buffer.from(chunk) : Buffer.concat([held, chunk]);
      if (held.length <= cap) {
        return;
      }
      // Drop from the front. The oldest bytes are the ones a late reader is
      // least likely to want and the ones that keep the buffer bounded.
      const excess = held.length - cap;
      held = held.subarray(excess);
      cursor = 0;
      dropped = true;
    },
    read(maxReadBytes: number): BufferRead {
      const limit = Math.max(0, Math.trunc(maxReadBytes));
      const unread = held.length - cursor;
      if (unread <= 0) {
        return { text: "", dropped, heldBack: 0 };
      }
      const take = Math.min(unread, limit);
      const end = cursor + take;
      const text = held.subarray(cursor, end).toString("utf8");
      cursor = end;
      compact();
      return { text, dropped, heldBack: held.length - cursor };
    },
    get byteLength(): number {
      return held.length - cursor;
    },
    get dropped(): boolean {
      return dropped;
    },
    reset(): void {
      held = Buffer.alloc(0);
      cursor = 0;
      dropped = false;
    },
  };
}
