export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

export type Err<C extends string> = {
  readonly ok: false;
  readonly code: C;
  readonly message: string;
};

export type Result<T, C extends string> = Ok<T> | Err<C>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<C extends string>(code: C, message: string): Err<C> {
  return { ok: false, code, message };
}
