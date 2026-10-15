// Trylo Desktop — ContextRing test. See v1.16.0.

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextRing } from './ContextRing';

const Ring = (props: Parameters<typeof ContextRing>[0]) =>
  createElement(ContextRing, props);

import { createElement } from 'react';

describe('ContextRing', () => {
  it('renders no dash label when there is no usage data', () => {
    render(Ring({ used: 0, total: 200_000 }));
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).not.toContain('—');
    expect(btn.querySelector('.context-ring__label')).toBeNull();
  });

  it('renders the short label + percentage when there is data', () => {
    render(Ring({ used: 47_231, total: 200_000 }));
    // 47_231 / 200_000 ≈ 24% -> label reads "47k · 24%".
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('47k');
    expect(btn.textContent).toContain('24%');
  });

  it('uses a different tier class per percentage', () => {
    const { container } = render(Ring({ used: 50_000, total: 200_000 }));
    // 25% — safe tier.
    const ring = container.querySelector('button.context-ring')!;
    expect(ring.className).toContain('context-ring--safe');
  });

  it('switches to the hot tier at >= 85%', () => {
    const { container } = render(Ring({ used: 180_000, total: 200_000 }));
    const ring = container.querySelector('button.context-ring')!;
    expect(ring.className).toContain('context-ring--hot');
  });

  it('switches to the danger tier at >= 95%', () => {
    const { container } = render(Ring({ used: 195_000, total: 200_000 }));
    const ring = container.querySelector('button.context-ring')!;
    expect(ring.className).toContain('context-ring--danger');
  });

  it('is disabled (passive gauge) when onCompact is not provided', () => {
    render(Ring({ used: 47_231, total: 200_000 }));
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('fires onCompact when clicked (with onCompact provided)', () => {
    const onCompact = vi.fn();
    render(Ring({ used: 47_231, total: 200_000, onCompact }));
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it('briefly shows "✓ Sent" after click then reverts', () => {
    const onCompact = vi.fn();
    render(Ring({ used: 47_231, total: 200_000, onCompact }));
    const btn = screen.getByRole('button');
    expect(btn.textContent).not.toContain('✓');
    fireEvent.click(btn);
    expect(btn.textContent).toContain('✓ Sent');
  });

  it('uses brand-300 stroke color in safe/warm/hot tiers', () => {
    const { container } = render(Ring({ used: 100_000, total: 200_000 }));
    // 50% — safe tier. The SVG arc carries the tier class that
    // context-ring.css styles with --brand-300 for safe/warm/hot.
    const fill = container.querySelector('.context-ring__arc')!;
    expect(fill).toBeInTheDocument();
    expect(fill.getAttribute('class')).toContain('context-ring__arc--safe');
  });
});

describe('ContextRing tooltip pill (v1.17.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function tip(): HTMLElement {
    return document.querySelector('.context-ring__tip') as HTMLElement;
  }

  function advance(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('replaces the native title with a short pill + aria-label', () => {
    render(Ring({ used: 47_231, total: 200_000, onCompact: vi.fn() }));
    const btn = screen.getByRole('button');
    // The dev-facing sentence ("...Run `pnpm tauri:dev`...") must not
    // come back through either channel.
    expect(btn.getAttribute('title')).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('点击压缩上下文');
    expect(tip().textContent).toBe('点击压缩上下文');
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
  });

  it('opens 300ms after hover and closes when the pointer leaves', () => {
    render(Ring({ used: 47_231, total: 200_000, onCompact: vi.fn() }));
    const wrap = document.querySelector('.context-ring-wrap')!;
    fireEvent.mouseOver(wrap);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
    advance(299);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
    advance(1);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(true);
    fireEvent.mouseOut(wrap);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
  });

  it('cancels a pending pill when the pointer leaves early', () => {
    render(Ring({ used: 47_231, total: 200_000, onCompact: vi.fn() }));
    const wrap = document.querySelector('.context-ring-wrap')!;
    fireEvent.mouseOver(wrap);
    fireEvent.mouseOut(wrap);
    advance(1000);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
  });

  it('opens on keyboard focus and closes on Escape', () => {
    render(Ring({ used: 47_231, total: 200_000, onCompact: vi.fn() }));
    const btn = screen.getByRole('button');
    fireEvent.focusIn(btn);
    advance(300);
    expect(tip().classList.contains('context-ring__tip--open')).toBe(true);
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
  });

  it('hides the pill on click so the ✓ Sent confirmation owns the moment', () => {
    const onCompact = vi.fn();
    render(Ring({ used: 47_231, total: 200_000, onCompact }));
    const wrap = document.querySelector('.context-ring-wrap')!;
    fireEvent.mouseOver(wrap);
    advance(300);
    fireEvent.click(screen.getByRole('button'));
    expect(tip().classList.contains('context-ring__tip--open')).toBe(false);
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it('still shows the passive copy on hover when the ring is disabled', () => {
    // A disabled button fires no mouse events — the hint rides on
    // the wrapper, like the old native title did.
    render(Ring({ used: 47_231, total: 200_000 }));
    const wrap = document.querySelector('.context-ring-wrap')!;
    fireEvent.mouseOver(wrap);
    advance(300);
    expect(tip().textContent).toBe('上下文用量');
    expect(tip().classList.contains('context-ring__tip--open')).toBe(true);
  });
});
