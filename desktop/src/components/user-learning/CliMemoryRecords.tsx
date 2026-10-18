import { useState, type ReactElement } from 'react';
import type { CliMemoryFact } from '../../user-learning/cli-memory';

export type CliMemoryRecordsProps = {
  readonly facts: readonly CliMemoryFact[];
  readonly error?: string;
  readonly onChange?: (fact: CliMemoryFact, statement: string | undefined) => Promise<void>;
};

/** Mutations return to the CLI writer; this component never edits a local snapshot. */
export function CliMemoryRecords(props: CliMemoryRecordsProps): ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const apply = async (fact: CliMemoryFact, statement?: string): Promise<void> => {
    if (busy || props.onChange === undefined) return;
    setBusy(true); setError(undefined);
    try { await props.onChange(fact, statement); setEditing(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '记忆更新失败'); }
    finally { setBusy(false); }
  };
  return <div aria-label="Trylo 用户记忆">
    {(props.error ?? error) ? <p role="alert">{props.error ?? error}</p> : null}
    <ul className="learning-inspector__list">{props.facts.map((fact) => <li key={fact.id}>
      <strong>用户记忆</strong>
      {editing === fact.id ? <>
        <textarea aria-label="记忆内容" value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} />
        <button type="button" disabled={busy || draft.trim() === ''} onClick={() => { void apply(fact, draft.trim()); }}>保存修改</button>
        <button type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button>
      </> : <>
        <p>{fact.statement}</p>
        {props.onChange ? <>
          <button type="button" disabled={busy} onClick={() => { setEditing(fact.id); setDraft(fact.statement); }}>修改</button>
          <button type="button" disabled={busy} onClick={() => { void apply(fact); }}>撤回</button>
        </> : null}
      </>}
    </li>)}</ul>
  </div>;
}
