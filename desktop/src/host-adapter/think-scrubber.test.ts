// Round-3 P2: literal <think> / </think> must not reach the transcript.
//
// The red baselines for cases 1-3 are the acceptance samples themselves
// (leveldb `001985.log`, session `code-musy5wnw-sz4xu`, 2 persisted `text`
// records containing a literal `</think>`). Before the scrubber those strings
// were rendered verbatim: `…as the ground truth.</think>Let me make one
// clean run…`.

import { describe, it, expect } from 'vitest';
import { ThinkScrubber, scrubThinkTags } from './think-scrubber';

/** Feed a whole message through the streaming path, as the adapters do. */
function stream(chunks: readonly string[]): string {
  const scrubber = new ThinkScrubber();
  let out = '';
  for (const chunk of chunks) out += scrubber.push(chunk).text;
  return out + scrubber.flush();
}

describe('ThinkScrubber', () => {
  it('drops a lone close tag while keeping the answer on both sides (acceptance sample)', () => {
    const raw =
      'Let me run it.</think>Let me execute the helper that writes RESULT.md deterministically, then verify.';
    const clean = stream([raw]);
    expect(clean).toBe(
      'Let me run it.Let me execute the helper that writes RESULT.md deterministically, then verify.'
    );
    expect(clean).not.toContain('think');
  });

  it('removes a fully wrapped think block including the reasoning prose', () => {
    expect(stream(['before <think>secret reasoning</think> after'])).toBe('before  after');
  });

  it('is streaming-safe when the tag is split across deltas', () => {
    // Providers chunk by token, not by tag; `<thi` + `nk>` is a real shape.
    expect(stream(['a<thi', 'nk>hidden', '</think>b'])).toBe('ab');
    expect(stream(['x</thi', 'nk>y'])).toBe('xy');
  });

  it('never leaks a partial tag when the message ends mid-tag', () => {
    const scrubber = new ThinkScrubber();
    expect(scrubber.push('done<thi').text).toBe('done');
    expect(scrubber.flush()).toBe('');
  });

  it('keeps ordinary prose that merely contains a "<"', () => {
    expect(stream(['if a < b and c > d then'])).toBe('if a < b and c > d then');
  });

  it('does not carry think state across messages', () => {
    // An unclosed <think> in message 1 must not blank out message 2.
    const first = new ThinkScrubber();
    first.push('<think>unterminated reasoning');
    const second = new ThinkScrubber();
    expect(second.push('fresh answer').text).toBe('fresh answer');
  });

  it('scrubThinkTags handles whole text in one call', () => {
    expect(scrubThinkTags('x<think>y</think>z')).toBe('xz');
  });
});
