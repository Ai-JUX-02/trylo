import type { ReduceInput } from "../domain/input.js";
import { freezeEnvelope } from "../protocol/validate.js";
import type { Envelope } from "../protocol/envelope.js";
import type { UnsequencedEvent } from "../protocol/sequencer.js";
import { createAttemptSequencer, type AttemptSequencer } from "../protocol/sequencer.js";

export type JournalSnapshot = {
  readonly envelopes: readonly Envelope[];
  readonly inputs: readonly ReduceInput[];
};

export type ExecutionJournal = {
  append(event: UnsequencedEvent): Envelope;
  recordInput(input: ReduceInput): void;
  events(): readonly Envelope[];
  inputs(): readonly ReduceInput[];
  snapshot(): JournalSnapshot;
  bindAttempt(attemptId: string): void;
};

export function createExecutionJournal(): ExecutionJournal {
  const events: Envelope[] = [];
  const inputs: ReduceInput[] = [];
  let sequencer: AttemptSequencer | undefined;
  return {
    bindAttempt(attemptId) {
      sequencer = createAttemptSequencer(attemptId);
    },
    recordInput(input) {
      inputs.push(input);
    },
    append(event) {
      const envelope =
        sequencer === undefined
          ? freezeEnvelope({ ...event, sequence: events.length })
          : sequencer.bind(event);
      events.push(envelope);
      return envelope;
    },
    events() {
      return [...events];
    },
    inputs() {
      return [...inputs];
    },
    snapshot() {
      return { envelopes: [...events], inputs: [...inputs] };
    },
  };
}

export function serializeJournal(snapshot: JournalSnapshot): string {
  return `${JSON.stringify(snapshot)}\n`;
}

export function parseJournal(raw: string): JournalSnapshot {
  const parsed = JSON.parse(raw) as JournalSnapshot;
  return {
    envelopes: [...parsed.envelopes],
    inputs: [...parsed.inputs],
  };
}
