// Trylo Desktop — follow-mode state machine for the conversation timeline.
//
// "Follow" means: the user wants to watch the tail, so every streaming delta
// re-pins the list to the bottom (MessageList's items effect). The previous
// implementation disarmed ONLY on wheel-up / PageUp / ArrowUp — a scrollbar
// drag, touch scroll or Home key left it armed, and every streaming delta
// then yanked the view back down. The user scrolling up against that pull
// was the violent "上滑抖动" during workflow runs.
//
// Disarming then moved to ANY upward movement of scrollTop (position-based,
// input agnostic). That fixed the device hole but opened Round-3's P1-6:
// the converse lies. During a live run rows ABOVE the tail constantly get
// SHORTER — a finished reasoning phase auto-collapses 420ms after it goes
// inactive (CodeReasoningTranscript), and completed tool rows drop out of
// the visible entries. Chrome's scroll anchoring compensates by moving
// scrollTop up by exactly the height that disappeared. Follow died there:
// - the 📌 pill came back (⇩ "跳到底部"),
// - nothing re-pinned afterwards, so two screenshots 77s apart during a
//   23→25 tools run were pixel-identical.
//
// The rule is therefore about WHO moved the view, not about the raw number:
// an upward scrollTop move is the USER leaving the tail only to the extent
// that it is NOT explained by content that disappeared. Content growing
// below the viewport never moves scrollTop at all, so it never mattered.

/** One observation of the scroller's geometry, taken on its `scroll` event. */
export interface FollowMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface FollowController {
  isFollowing(): boolean;
  /** Re-arm following. Explicit signals only: sending a message (the new
   *  turn is the user's) and clicking the follow-tail pill. */
  rearm(): void;
  /** Feed every scroller geometry observation. Returns true when THIS call
   *  disarmed the follow (the user moved away from the tail). */
  observe(metrics: FollowMetrics): boolean;
}

/** Sub-pixel floor: Windows reports fractional scrollTop at zoom levels
 *  like 125%, so anything below this is wobble, not movement. */
const WOBBLE_TOLERANCE = 1;

export function createFollowController(): FollowController {
  let following = true;
  let last: FollowMetrics | null = null;
  return {
    isFollowing: () => following,
    rearm: () => {
      following = true;
    },
    observe: (metrics) => {
      const prev = last;
      last = metrics;
      // The first observation only seeds the baseline — there is no previous
      // position to compare against, so nothing can have "moved".
      if (!prev || !following) return false;

      const movedUp = prev.scrollTop - metrics.scrollTop;
      if (movedUp <= WOBBLE_TOLERANCE) return false; // down or wobble ⇒ keep

      // How much content disappeared between the two observations. Rows above
      // the viewport collapsing is layout compensation, not the user: the
      // browser holds still for everything below (scroll anchoring), which
      // costs exactly that much scrollTop.
      const lostHeight = Math.max(0, prev.scrollHeight - metrics.scrollHeight);
      const userMoveUp = movedUp - lostHeight;
      if (userMoveUp <= WOBBLE_TOLERANCE) return false;

      following = false;
      return true;
    },
  };
}

/**
 * Round-3 (P1-6, raised to P0): the "跳到底部" pill is a LIVE-RUN affordance.
 *
 * Window evidence that made this a P0: a turn that had already produced a
 * complete, honest Chinese summary on disk (`status: "done"`, run ended
 * 18:49:50) sat invisible because the view had stopped two screenshots
 * earlier, and the only visible cue was the ↓ pill — which in a finished
 * conversation is a self-incrimination: if the run is over and we still owe
 * the reader a pin, then our own state is wrong. A successful delivery must
 * never be displayed as a silent failure.
 *
 * So: no run ⇒ no pill. The run-end pin (see MessageList) is what puts the
 * ending in front of the reader, not a button they have to know about.
 */
export function shouldShowFollowPill(input: {
  readonly running: boolean;
  readonly atBottom: boolean;
  readonly following: boolean;
  readonly messageCount: number;
}): boolean {
  if (!input.running) return false;
  if (input.messageCount === 0) return false;
  return !input.atBottom && !input.following;
}

/**
 * The one moment that MUST re-pin, regardless of anything the reader did:
 * the turn ended. `true → false` is the run's terminal edge; the final answer
 * is the payload of that edge, so it goes to the bottom unconditionally.
 */
export function shouldForceTailPin(prevRunning: boolean, running: boolean): boolean {
  return prevRunning && !running;
}
