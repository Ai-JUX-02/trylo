import type { BoardCommand } from "./commands.js";
import type { ReasonCode } from "./reasons.js";
import type { ReduceErr, ReduceOk } from "./result.js";
import type { BoardState } from "./state.js";

export type StoreLoadOk = {
  readonly ok: true;
  readonly state: BoardState;
  readonly generation: number;
};

export type StoreLoadErr = {
  readonly ok: false;
  readonly reason: ReasonCode;
  readonly detail: string;
};

export type StoreLoadResult = StoreLoadOk | StoreLoadErr;

export type BoardStore = {
  apply(command: BoardCommand): Promise<ReduceOk | ReduceErr | StoreLoadErr>;
  load(): Promise<StoreLoadResult>;
  snapshot(expectedGeneration: number): Promise<StoreLoadResult>;
  compact(expectedGeneration: number): Promise<StoreLoadResult>;
  close(): Promise<void>;
};
