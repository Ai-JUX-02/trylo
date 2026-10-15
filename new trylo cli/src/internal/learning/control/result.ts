import type { BoardEvent } from "./events.js";
import type { ReasonCode } from "./reasons.js";
import type { BoardState } from "./state.js";

export type ReduceOk = {
  readonly ok: true;
  readonly state: BoardState;
  readonly events: ReadonlyArray<BoardEvent>;
  readonly idempotent: boolean;
};

export type ReduceErr = {
  readonly ok: false;
  readonly state: BoardState;
  readonly reason: ReasonCode;
  readonly detail: string;
};

export type ReduceResult = ReduceOk | ReduceErr;

export function fail(
  state: BoardState,
  reason: ReasonCode,
  detail: string,
): ReduceErr {
  return { ok: false, state, reason, detail };
}

export function replay(state: BoardState): ReduceOk {
  return { ok: true, state, events: [], idempotent: true };
}

export function nextSeq(state: BoardState): number {
  return state.sequence + 1;
}

export function succeed(
  state: BoardState,
  commandId: string,
  events: ReadonlyArray<BoardEvent>,
  patch: Partial<Omit<BoardState, "sequence" | "appliedCommands">>,
): ReduceOk {
  const sequence =
    events.length > 0 ? events[events.length - 1]!.sequence : state.sequence + 1;
  return {
    ok: true,
    idempotent: false,
    events,
    state: {
      ...state,
      ...patch,
      sequence,
      appliedCommands: [...state.appliedCommands, { commandId, sequence }],
    },
  };
}
