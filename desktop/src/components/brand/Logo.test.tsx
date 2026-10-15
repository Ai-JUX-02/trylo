import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo brand mark', () => {
  it('uses the unified mobile geometry (3 paths, stroke 60)', () => {
    const { container } = render(<Logo decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(container.querySelector('g')?.getAttribute('stroke-width')).toBe('60');
    // First path is the mobile launcher foreground's, verbatim.
    expect(paths[0]?.getAttribute('d')).toBe('M475 308 L475 444 L595 444');
  });

  it('paints the cream stroke for tone="cream" (mobile launcher colour)', () => {
    const { container } = render(<Logo decorative tone="cream" variant="solid" />);
    expect(container.querySelector('stop')?.getAttribute('stop-color')).toBe('#F3E3A6');
  });

  it('withBg renders the #111318 chip at the requested size', () => {
    const { container } = render(<Logo size={40} decorative tone="cream" variant="solid" withBg />);
    const chip = container.querySelector('.trilo-mark--chip') as HTMLElement;
    expect(chip.style.backgroundColor.replace(/\s/g, '')).toMatch(/^(#111318|rgb\(17,19,24\))$/);
    expect(chip.style.width).toBe('40px');
    expect(chip.style.borderRadius).toBe('11px');
  });

  it('centres optically: ink BBOX on the canvas, then a small lift', () => {
    const { container } = render(<Logo decorative />);
    // Centring on the ink CENTROID (509.5, 528.5) looks "pushed to
    // the top" because two heavy chevrons carry ~65% of the ink
    // below the bbox centre. The eye tracks the outline, so the bbox
    // centre (526, 491.5) is the baseline plus a 3-unit lift.
    // Guards the transform string so it can't silently regress.
    const g = container.querySelector('g')!;
    expect(g.getAttribute('transform')).toBe('translate(-14 17.5)');
  });

it('sizes the mark canvas for the chosen ink coverage inside the chip', () => {
    const { container } = render(<Logo size={40} decorative withBg />);
    const svg = container.querySelector('svg')!;
    // 1024 * 0.82 * 40 / 438 = 76.7 -> 77: deliberately LARGER than
    // the chip; logo.css pins flex-shrink: 0 so the chip cannot
    // flatten it (that bug shipped once in the preview already).
    expect(svg.getAttribute('width')).toBe('77');
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(40);
  });
});
