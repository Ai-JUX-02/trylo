// Round-3 (P1-7): the conversation timeline scrolls VERTICALLY only.
//
// Reported from a real window: during an 11-minute run the event stream grew
// a HORIZONTAL scrollbar; long paragraphs and fenced code blocks pushed the
// column wider than the container, prose was clipped at the right edge
// (`words.txt` / `verified wo…txt` were cut), and the floating "跳到底部"
// button sat centred ON the text column, pressing those same pills.
//
// jsdom has no layout engine, so this contract is enforced at source level —
// same approach as reduced-motion.test.ts. Three things must hold:
//
//   1. the scroller itself never scrolls sideways;
//   2. a markdown code fence WRAPS (the UA default `white-space: pre` is the
//      thing that widened the column — nothing ever overrode it);
//   3. the follow-tail button is anchored to the right gutter, not centred
//      over the column it would otherwise cover.
//
// A future change that reintroduces any of the three fails the build here
// rather than in someone else's window.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles/components');
const messageCss = readFileSync(resolve(STYLES, 'message.css'), 'utf8');
const listCss = readFileSync(resolve(STYLES, 'message-list.css'), 'utf8');

/** Body of the last rule declaring exactly this selector (comments stripped). */
function ruleBody(css: string, selector: string): string {
  // CRLF checkout is the norm here; normalize so a multi-line selector
  // written with \n in this file still matches.
  const clean = css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g').exec(clean);
  return match?.[1] ?? '';
}

describe('chat timeline overflow contract (Round-3 P1-7)', () => {
  it('the timeline scroller cannot scroll horizontally', () => {
    const body = ruleBody(listCss, '.message-list [data-virtuoso-scroller]');
    expect(body).not.toBe('');
    expect(body).toMatch(/overflow-x\s*:\s*(hidden|clip)\s*;/);
  });

  it('wraps markdown code fences instead of widening the column', () => {
    const fence = ruleBody(messageCss, '.message__text--markdown pre');
    expect(fence).not.toBe('');
    // `pre-wrap` keeps indentation + explicit line breaks and still folds.
    expect(fence).toMatch(/white-space\s*:\s*pre-wrap\s*;/);
    // ...and an unbroken token needs permission to break ANYWHERE.
    expect(fence).toMatch(/overflow-wrap\s*:\s*anywhere\s*;|word-break\s*:\s*break-word\s*;/);
    expect(fence).toMatch(/max-width\s*:\s*100%\s*;/);
  });

  it('lets inline code break inside the bubble too', () => {
    const inline = ruleBody(messageCss, '.message__text--markdown code,\n.message__text code,\n.message__bubble code');
    expect(inline).not.toBe('');
    expect(inline).toMatch(/overflow-wrap\s*:\s*anywhere\s*;|word-break\s*:\s*break-word\s*;/);
  });

  it('keeps the follow-tail button out of the text column', () => {
    const btn = ruleBody(listCss, '.message-list__scroll-btn');
    expect(btn).not.toBe('');
    // Centring is what put the button on top of file pills and line ends.
    expect(btn).not.toMatch(/left\s*:\s*50%/);
    expect(btn).toMatch(/right\s*:/);
  });

  it('keeps the prose face itself wrapping (inherited by children)', () => {
    const text = ruleBody(messageCss, '.message__text');
    expect(text).toMatch(/word-wrap\s*:\s*break-word\s*;|overflow-wrap\s*:/);
  });
});
