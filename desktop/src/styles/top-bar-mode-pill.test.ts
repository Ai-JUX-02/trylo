// Round-3 (P0-9): the top-bar mode pill must stay clickable AT EVERY WIDTH.
//
// This is a RECURRING defect, not a new one. The stylesheet records the first
// occurrence verbatim (top-bar.css:114-120):
//
//   "After the 2026-08-29 z-index fix flipped the utilities to win clicks,
//    the Code/Work pill could be swallowed by the right cluster at boundary
//    widths: Work (the pill's right-hand tab) slid under 了解我/远程/⚙ and
//    became unclickable while Code still worked — a one-directional
//    mode-switch bug (2026-09-03)."
//
// The window report is the same shape again: Work unclickable, Code fine.
// `TopBar.modes.test.tsx` proves the React chain fires; this file proves the
// CSS cannot put another control on top of the pill — the only layer a unit
// test cannot observe, and the layer that broke twice.
//
// jsdom loads no stylesheets, so this is source-level, like
// `reduced-motion.test.ts`.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOP_BAR = resolve(process.cwd(), 'src/styles/components/top-bar.css');

/** The repo is a CRLF checkout; the patterns below are written with `\n`. */
function sheet(): string {
  return readFileSync(TOP_BAR, 'utf8').replace(/\r\n/g, '\n');
}

/** Body of the first rule whose selector list contains `selector`.
 *
 *  Comments are stripped FIRST: this stylesheet documents the very selectors
 *  under test ("`.top-bar__right` is z-index: 2"), and a naive indexOf would
 *  match that prose instead of the rule. */
function ruleBody(selector: string): string {
  const css = sheet().replace(/\/\*[\s\S]*?\*\//g, '');
  const header = `.${selector}`;
  const at = css.indexOf(`${header} {`);
  if (at === -1) return '';
  const end = css.indexOf('}', at);
  return css.slice(at + header.length + 2, end);
}

describe('top-bar mode pill stays the click target (Round-3 P0-9)', () => {
  it('keeps the pill above the right-side control cluster', () => {
    const pill = ruleBody('top-bar__modes');
    expect(pill).toMatch(/z-index:\s*3/);
    // The cluster it must beat.
    expect(ruleBody('top-bar__right')).toMatch(/z-index:\s*2/);
  });

  it('stacks the pill by raising itself, not by demoting the utilities', () => {
    // The 2026-08-29 regression was fixed in the wrong direction once: the
    // utilities were raised and the pill sank. Assert the pill owns the
    // higher level so the next fix cannot repeat that trade.
    const pillZ = Number(/z-index:\s*(\d+)/.exec(ruleBody('top-bar__modes'))?.[1] ?? '0');
    const rightZ = Number(/z-index:\s*(\d+)/.exec(ruleBody('top-bar__right'))?.[1] ?? '0');
    expect(pillZ).toBeGreaterThan(rightZ);
  });

  it('creates a positioned box for that z-index to apply to', () => {
    // `z-index` on a static element is ignored — the pill would silently lose
    // the stacking contest even with the right number written down.
    expect(ruleBody('top-bar__modes')).toMatch(/position:\s*relative/);
  });

  it('clamps the optical nudge so the pill never slides over the utilities', () => {
    // translateX moves the hit area with the pixels, so this is a hit-testing
    // concern, not a cosmetic one. Unclamped, Work (the right-hand tab) is the
    // first thing to end up underneath the cluster.
    const pill = ruleBody('top-bar__modes');
    expect(pill).toMatch(/transform:\s*translateX\(/);
    // The clamp term: max(0px, …) keeps it non-negative, the min(…) caps it.
    expect(pill).toMatch(/max\(0px/);
    expect(pill).toMatch(/min\(/);
  });

  it('reserves the grown right cluster (P0-9 follow-up: 290px went stale)', () => {
    // The 290px reserve predates the 学习 chip, the `N active` chip and the
    // browser globe — with all three mounted the cluster is ~440px and the
    // old (100vw − 820px)/2 clamp let the pill tuck under it on ordinary
    // laptop widths. The critical width must encode the grown cluster, so
    // the next right-side button forces this number up instead of silently
    // re-opening the overlap.
    const pill = ruleBody('top-bar__modes');
    const critical = Number(/100vw\s*-\s*(\d+)px/.exec(pill)?.[1] ?? '0');
    expect(critical).toBeGreaterThanOrEqual(1000);
  });
});
