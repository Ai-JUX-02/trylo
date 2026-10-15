// Trylo Desktop — TurnProgress component tests (spec §11.4).
//
// §11.4: the row must appear the moment the user sends —
// even before any runtime output — and turn static once the
// first meaningful output freezes the timer (spec §6.2).

import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { TurnProgress } from './TurnProgress';

describe('TurnProgress timing (§11.4 / §6.2)', () => {
  it('appears immediately after send as a live but visually static timer', () => {
    const started = Date.now() - 5000;
    const { container } = render(
      <TurnProgress turnStartedAt={started} isActive />,
    );
    const row = container.querySelector('.turn-progress');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('role')).toBe('status');
    // Live counter without the "已工作" freeze prefix.
    expect(container.textContent).toBe('0:05');
    // The newest timeline footer owns startup motion; this historical row is
    // deliberately static so the screen never has two competing loops.
    expect(container.querySelector('.turn-progress__logo--spin')).toBeNull();
  });

  it('freezes to "已工作" once the first output lands (finalElapsedMs set)', () => {
    const { container } = render(
      <TurnProgress turnStartedAt={1000} finalElapsedMs={12000} isActive={false} />,
    );
    expect(container.textContent).toBe('已工作 0:12');
    // No animation in the frozen state.
    expect(container.querySelector('.turn-progress__logo--spin')).toBeNull();
  });

  it('renders nothing when there is no recorded send time (history)', () => {
    const { container } = render(
      <TurnProgress turnStartedAt={null} isActive={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('an inactive turn with no recorded elapsed says so instead of inventing one', () => {
    // P0-3: this fixture used to be `Date.now() - 1000` with an
    // assertion of "已工作 0:0X" — an assertion that structurally
    // CANNOT notice the value growing between mounts, so it pinned
    // the defect as the expected behaviour. A fixed clock and an
    // explicit `null` are what actually exercise the branch.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_700_000_000_000);
      const { container } = render(
        <TurnProgress
          turnStartedAt={1_699_999_990_000}
          finalElapsedMs={null}
          isActive={false}
        />,
      );
      expect(container.querySelector('.turn-progress__logo--spin')).toBeNull();
      expect(container.textContent).toBe('耗时未知');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a historical turn never renders a clock-derived elapsed time (P0-3)', () => {
    // The real defect: a finished turn whose elapsed time was never
    // recorded rendered `now - turnStartedAt`. Because the tick
    // interval does not run for an inactive turn, `now` was simply
    // the MOUNT time, so every remount jumped the value (0:55 →
    // 4:44 → "20:00+") on a turn that had run for a few seconds.
    vi.useFakeTimers();
    try {
      const started = 1_700_000_000_000;
      vi.setSystemTime(started + 3_600_000); // 1h after the turn began
      const first = render(
        <TurnProgress turnStartedAt={started} finalElapsedMs={null} isActive={false} />,
      );
      const firstText = first.container.textContent;
      expect(firstText).not.toMatch(/1:00:00/);
      expect(firstText).toBe('耗时未知');
      first.unmount();

      // One hour later: remounting must produce identical output.
      vi.setSystemTime(started + 7_200_000);
      const second = render(
        <TurnProgress turnStartedAt={started} finalElapsedMs={null} isActive={false} />,
      );
      expect(second.container.textContent).toBe(firstText);
      expect(second.container.textContent).not.toMatch(/2:00:00/);
      second.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an undefined elapsed behaves exactly like a null one', () => {
    // Older persisted rows omit the key entirely; newer ones may
    // carry an explicit null. Both must read as "unknown".
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_700_000_000_000);
      const { container } = render(
        <TurnProgress turnStartedAt={1_699_999_990_000} isActive={false} />,
      );
      expect(container.textContent).toBe('耗时未知');
    } finally {
      vi.useRealTimers();
    }
  });
});
