// Trylo Desktop — context-window ring. See v1.16.0.
//
// v1.16.2.6: FINAL simplification. The previous
// "click to open a popover with usage + a Compact now
// action" design kept failing in the browser — the
// popover was being clipped or not rendering, the user
// got no visible feedback, the click appeared to do
// nothing. We're not going to keep iterating on the
// popover. The new design is the simplest possible
// thing that works:
//
//   - The ring is a plain <button>.
//   - Click fires onCompact directly. No popover, no
//     state machine, no portal, no positioning.
//   - Busy and completion come from the runtime; clicking never claims success.
//   - The label next to the ring still shows the
//     current token count, e.g. "47k".
//
// Context % is shown as a number next to the label
// (e.g. "47k · 24%"). The user can read it directly
// without opening a popover.
//
// v1.17.4: the tooltip became a custom pill. It used
// to be the button's `title` attribute: unstylable
// (system font, OS timing, no placement control), its
// copy leaked dev instructions into the UI ("Run
// `pnpm tauri:dev` to actually trigger the
// compaction"), and the same string doubled as the
// aria-label so screen readers read the whole lecture.
// Now:
//   - A small inverted pill ("点击压缩上下文" /
//     "上下文用量" when passive) fades in 300ms after
//     hover or keyboard focus, and hides on leave,
//     blur, Escape or click.
//   - It opens UPWARD (the v1.16.2.5 popover opened
//     downward and kept getting clipped by the
//     composer's bottom edge) and is right-aligned to
//     the ring so it never leaves the window.
//   - The pill is aria-hidden and purely visual; the
//     same short string is the button's aria-label.
//   - Hover lives on a wrapper span, NOT the button:
//     a disabled button fires no mouse events, and
//     the passive ring must still show its hint (the
//     native title used to).
//
// Data flow (unchanged):
//   CLI emits turn_end.usage.input_tokens
//     -> events.ts applyTurnEnd
//     -> App.tsx derives currentContextTokens
//     -> this component
//   Click -> onCompact() -> App.tsx writes /compact
//     to stdin -> CLI summarises + emits compact events.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatTokenCountShort } from '../../host-adapter/context-windows';

export interface ContextRingProps {
  readonly used: number;
  readonly total: number;
  /** Optional. When provided, the ring is clickable and
   *  calls onCompact on click. When undefined, the ring
   *  is a passive gauge. */
  readonly onCompact?: () => void;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly unknown?: boolean;
}

/** Hover/focus delay before the tooltip pill fades in. */
const TIP_DELAY_MS = 300;

function tierClass(pct: number): string {
  if (pct < 60) return 'safe';
  if (pct < 85) return 'warm';
  if (pct < 95) return 'hot';
  return 'danger';
}

export function ContextRing(props: ContextRingProps): ReactElement {
  const { used, total, onCompact } = props;
  const hasData = used > 0;
  // 2026-09-04: an EMPTY conversation now renders a visible "0%" ring
  // instead of a bare 20px track that looked like a missing element.
  // The arc clamps to a small minimum so the gauge reads as a ring.
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const arcPct = hasData ? Math.max(pct, 2) : 2;
  const tier = tierClass(pct);
  const shortLabel = hasData ? formatTokenCountShort(used) : '0';
  const interactive = typeof onCompact === 'function';
  // One short string, two jobs: the pill's copy and the
  // button's accessible name. The old dev-facing sentence
  // ("...Run `pnpm tauri:dev` to actually trigger...") is
  // gone from the UI; it lives in the header comment.
  const tipText = props.busy ? '正在压缩上下文' : props.unknown ? '等待模型返回上下文用量' : props.disabled ? '当前任务结束后可压缩本次对话' : interactive ? '点击压缩上下文' : '上下文用量';

  // v1.17.4: tooltip pill visibility (delayed, see TIP_DELAY_MS).
  const [tipOpen, setTipOpen] = useState(false);
  const tipTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
  }, []);

  const showTip = (): void => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => {
      setTipOpen(true);
      tipTimer.current = null;
    }, TIP_DELAY_MS);
  };

  const hideTip = (): void => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    setTipOpen(false);
  };

  const handleClick = (): void => {
    onCompact?.();
    hideTip();
  };

  return (
    <span className="context-ring-wrap" onMouseEnter={showTip} onMouseLeave={hideTip}>
      <button
        type="button"
        className={`context-ring context-ring--${tier}${interactive ? ' context-ring--clickable' : ''}`}
        aria-label={tipText}
        onClick={interactive ? handleClick : undefined}
        onFocus={showTip}
        onBlur={hideTip}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hideTip();
        }}
        disabled={!interactive || props.busy || props.disabled}
      >
        {/* SVG ring gauge showing context usage percentage */}
        <svg
          className="context-ring__gauge"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          {/* Background track */}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="var(--border, rgba(255, 255, 255, 0.12))"
            strokeWidth="2.5"
          />
          {/* Foreground arc — stroke-dasharray draws the filled portion */}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(arcPct / 100) * 50.27} 50.27`}
            transform="rotate(-90 10 10)"
            className={`context-ring__arc context-ring__arc--${tier}`}
          />
        </svg>
        {(props.busy || props.unknown || hasData) && (
          <span className="context-ring__label">
            {props.busy ? '正在压缩…' : props.unknown ? '暂无读数' : `${shortLabel}${hasData ? ` · ${Math.round(pct)}%` : ''}`}
          </span>
        )}
      </button>
      {/* v1.17.4: the pill is a SIBLING of the button (positioned
          against the wrapper), visual only — the button's
          aria-label carries the same words for AT. */}
      <span
        className={`context-ring__tip${tipOpen ? ' context-ring__tip--open' : ''}`}
        aria-hidden="true"
      >
        {tipText}
      </span>
    </span>
  );
}
