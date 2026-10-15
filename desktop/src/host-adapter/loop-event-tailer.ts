import { hostAdapter } from './index';
import type { FilePath } from './types';
import type { LoopEvent } from './loop-events';
import { tailRead } from './tail-read';
import { StreamTranslator } from './stream-translator';
import { createBinaryMaterializePump } from './binary-materialize-pump';

export interface TailEventsArgs {
  /** Path to the events JSONL file. */
  readonly eventsFile: FilePath;
  /** Called for each batch of new events. */
  readonly onEvents: (events: readonly LoopEvent[]) => void;
  /** Poll interval in ms (default 50). */
  readonly intervalMs?: number;
  /** P3-B2: only forward events matching this predicate. Used to surface the
   *  CLI's high-fidelity loop events (which only land in the events file,
   *  never stdout) without duplicating the stdout-derived stream. */
  readonly filter?: (e: LoopEvent) => boolean;
}

export interface TailHandle {
  /** Stop the tailer. */
  readonly stop: () => void;
}

/**
 * Start a JSONL tailer on the events file. Polls the file every
 * 50ms via the hostAdapter.fs.readFile. Returns a handle to stop
 * the tailer.
 */
export function tailTryloEvents(args: TailEventsArgs): TailHandle {
  const intervalMs = args.intervalMs ?? 50;
  let pos = 0;
  let leftover = '';
  let previousByteSize: number | undefined;
  let state: 'idle' | 'reading' | 'stopped' = 'idle';
  const isActive = () => state !== 'stopped';
  const translator = new StreamTranslator();
  const pump = createBinaryMaterializePump();

  const tick = async (): Promise<void> => {
    if (state !== 'idle') return;
    state = 'reading';
    try {
      const result = await tailRead(args.eventsFile, pos, leftover, {
        readFile: (p) => hostAdapter.fs.readFile(p),
        stat: async (p) => {
          try {
            const s = await hostAdapter.fs.statFile(p);
            return { size: s.size };
          } catch {
            return null;
          }
        },
      }, previousByteSize);
      if (!isActive()) return;
      pos = result.pos;
      leftover = result.leftover;
      previousByteSize = result.totalSize ?? previousByteSize;
      if (result.events.length > 0) {
        const translated: LoopEvent[] = [];
        for (const raw of result.events) {
          const line = JSON.stringify(raw);
          for (const ev of translator.feed(line)) {
            translated.push(ev);
          }
        }
        const filtered = args.filter ? translated.filter(args.filter) : translated;
        if (filtered.length > 0) pump(filtered, events => {
          if (isActive()) args.onEvents(events);
        });
      }
    } catch {
      // Read failures leave the cursor unchanged so the next idle tick retries.
    } finally {
      if (isActive()) state = 'idle';
    }
  };

  const id = window.setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  return {
    stop: () => {
      state = 'stopped';
      window.clearInterval(id);
    },
  };
}
