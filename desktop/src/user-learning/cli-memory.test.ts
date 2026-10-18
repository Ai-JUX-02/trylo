import { describe, expect, it } from 'vitest';
import {
  loadCliMemoryFacts,
  parseMemoryListJson,
  snapshotToLegacyDocument,
  toProfileFacts,
  withCliFacts,
  type CliMemoryFact,
} from './cli-memory';
import { emptySnapshot } from './store';
import type { EvidenceRecord } from './types';
import type { FilePath } from '../host-adapter/types';

const FACT: CliMemoryFact = {
  id: 'fact-abc', version: 1, status: 'active', factKind: 'identity_fact',
  subject: 'YL Z', statement: '我是 YL Z，Trylo 的开发者', createdAt: 1_760_000_000_000,
};

const payload = (facts: readonly unknown[]): string => JSON.stringify({ facts });

describe('parseMemoryListJson', () => {
  it('reads the CLI rows and keeps the recordId as the identity', () => {
    const parsed = parseMemoryListJson(payload([FACT]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.facts[0]?.id).toBe('fact-abc');
  });

  it('rejects the whole list rather than trusting a half-decoded one', () => {
    expect(parseMemoryListJson(payload([FACT, { id: 'x' }])).ok).toBe(false);
    expect(parseMemoryListJson('not json').ok).toBe(false);
    expect(parseMemoryListJson('').ok).toBe(false);
  });
});

describe('withCliFacts', () => {
  it('does not resurrect a stale CLI projection after the canonical record was retracted', () => {
    const base = emptySnapshot(1, 'local-user');
    const stale = withCliFacts(base, [FACT], 'local-user');
    expect(withCliFacts(stale, [], 'local-user').profileFacts).toHaveLength(0);
  });
  it('lets the ledger win over a same-id localStorage row and keeps everything else', () => {
    const base = emptySnapshot(1, 'local-user');
    const snapshot = {
      ...base,
      profileFacts: [
        { id: 'fact-abc', userId: 'local-user', category: 'role_identity' as const, statement: '旧的本地版本',
          evidenceRefs: [], confidence: { score: 0.4, band: 'low' as const }, status: 'active' as const,
          createdAt: 1, updatedAt: 1 },
        { id: 'local-only', userId: 'local-user', category: 'domain_industry' as const, statement: '只在本地的记录',
          evidenceRefs: [], confidence: { score: 0.4, band: 'low' as const }, status: 'active' as const,
          createdAt: 2, updatedAt: 2 },
      ],
    };
    const merged = withCliFacts(snapshot, [FACT], 'local-user');
    expect(merged.profileFacts.find((f) => f.id === 'fact-abc')?.statement).toBe(FACT.statement);
    expect(merged.profileFacts.some((f) => f.id === 'local-only')).toBe(true);
    expect(merged.profileFacts).toHaveLength(2);
  });

  it('is a no-op when the ledger has no facts', () => {
    const snapshot = emptySnapshot(1, 'local-user');
    expect(withCliFacts(snapshot, [], 'local-user')).toBe(snapshot);
  });
});

describe('toProfileFacts', () => {
  it('maps each fact kind to a panel category and retraction to retired', () => {
    const facts = toProfileFacts([
      FACT,
      { ...FACT, id: 'b', factKind: 'project_fact' },
      { ...FACT, id: 'c', factKind: 'preference' },
      { ...FACT, id: 'd', status: 'retracted' },
    ], 'local-user');
    expect(facts.map((f) => f.category)).toEqual([
      'role_identity', 'long_term_work_context', 'capability_background', 'role_identity',
    ]);
    expect(facts[3]?.status).toBe('retired');
  });
});

describe('loadCliMemoryFacts', () => {
  function fakeProcess(behaviour: { out?: string; code?: number | null; hang?: boolean }) {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const stops: string[] = [];
    return {
      calls,
      stops,
      process: {
        async spawn(opts: {
          command: string; args: readonly string[]; onOutput: (line: string) => void;
          onExit?: (info: { id: string; pid: number; code: number | null; signal: number | null }) => void;
        }) {
          calls.push({ command: opts.command, args: opts.args });
          if (!behaviour.hang) {
            for (const line of (behaviour.out ?? '').split('\n')) if (line !== '') opts.onOutput(line);
            setTimeout(() => opts.onExit?.({ id: 'p1', pid: 1, code: behaviour.code ?? 0, signal: null }), 0);
          }
          return { id: 'p1', pid: 1, label: 'user-memory-list', command: opts.command };
        },
        async stop(id: string) { stops.push(id); },
      },
    };
  }

  const base = { cliPath: 'D:/x/main.js' as FilePath, cwd: 'D:/w' as FilePath };

  it('runs the canonical read command and parses its output', async () => {
    const fake = fakeProcess({ out: payload([FACT]) });
    const result = await loadCliMemoryFacts({ ...base, process: fake.process });
    expect(result).toEqual({ ok: true, facts: [FACT] });
    expect(fake.calls[0]?.args.slice(-3)).toEqual(['memory', 'list', '--json']);
  });

  it('reports a non-zero exit instead of pretending the list is empty', async () => {
    const fake = fakeProcess({ out: '', code: 52 });
    const result = await loadCliMemoryFacts({ ...base, process: fake.process });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : '').toContain('exit_52');
  });

  it('gives up on a hung command and stops the child', async () => {
    const fake = fakeProcess({ hang: true });
    const result = await loadCliMemoryFacts({ ...base, process: fake.process, timeoutMs: 20 });
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fake.stops).toContain('p1');
  });
});

describe('snapshotToLegacyDocument', () => {
  // A minimal evidence row: only `id` + `origin.eventType` matter to the
  // exporter, and building the full record would obscure what is being tested.
  const evidence = (id: string, eventType: string): EvidenceRecord => ({
    id,
    origin: { eventType },
  } as unknown as EvidenceRecord);

  function snapshotWith(eventType: string) {
    const base = emptySnapshot(1, 'local-user');
    return {
      ...base,
      evidence: [evidence('ev-1', eventType)],
      profileFacts: [
        { id: 'pf-1', userId: 'local-user', category: 'role_identity' as const,
          statement: '我是 YL Z，Trylo 的开发者', evidenceRefs: ['ev-1'],
          confidence: { score: 0.9, band: 'high' as const }, status: 'active' as const,
          createdAt: 5, updatedAt: 5 },
        { id: 'pf-2', userId: 'local-user', category: 'capability_background' as const,
          statement: '喜欢简短回答', evidenceRefs: [], confidence: { score: 0.5, band: 'medium' as const },
          status: 'retired' as const, createdAt: 6, updatedAt: 6 },
      ],
    };
  }

  it('marks a fact user-stated only when its own evidence is a user statement', () => {
    const stated = snapshotToLegacyDocument(snapshotWith('explicit_statement'));
    expect(stated.version).toBe(1);
    expect(stated.facts).toHaveLength(1);
    expect(stated.facts[0]).toMatchObject({
      legacyId: 'pf-1', provenance: 'user_stated', factKind: 'identity_fact', subject: 'YL Z',
    });
  });

  it('never claims user-stated for an inferred or uncited fact', () => {
    const inferred = snapshotToLegacyDocument(snapshotWith('model_inference'));
    expect(inferred.facts[0]?.provenance).toBe('unknown');

    const uncited = { ...snapshotWith('explicit_statement'), profileFacts: [
      { id: 'pf-3', userId: 'local-user', category: 'role_identity' as const, statement: '我是 X',
        evidenceRefs: [], confidence: { score: 0.9, band: 'high' as const },
        status: 'active' as const, createdAt: 7, updatedAt: 7 },
    ] };
    expect(snapshotToLegacyDocument(uncited).facts[0]?.provenance).toBe('unknown');
  });

  it('skips retired facts: the migration is not a resurrection', () => {
    const document = snapshotToLegacyDocument(snapshotWith('explicit_statement'));
    expect(document.facts.some((fact) => fact.legacyId === 'pf-2')).toBe(false);
  });
});
