export type TurnFinish = "completed" | "failed" | "cancelled" | "unknown";

export type CheckVerdict = "pass" | "fail" | "partial";

export type TurnFact = {
  readonly finish: TurnFinish;
};

export type CheckFact = {
  readonly verdict: CheckVerdict;
};

export function isVerified(input: { turn: TurnFact; check?: CheckFact }): boolean {
  return input.check?.verdict === "pass";
}
