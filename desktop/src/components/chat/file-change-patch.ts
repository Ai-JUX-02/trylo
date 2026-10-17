import type { DiffLine, FileChange } from './file-change-types';

export function changeFromLines(path: string, lines: readonly DiffLine[], extra: Partial<FileChange> = {}): FileChange {
  return { path, lines, additions: lines.filter(line => line.kind === 'add').length,
    deletions: lines.filter(line => line.kind === 'del').length,
    hunks: lines.filter(line => line.kind === 'hunk').length || 1,
    isNew: false, operation: 'patched', basis: 'request', lineNumbers: 'fragment', ...extra };
}

/** Display-only parser. It never applies patches or reads the current file. */
export function unifiedPatchChange(path: string, patch: string, basis: 'request' | 'result' = 'request'): FileChange | null {
  const lines: DiffLine[] = [];
  let active = false;
  let oldNo = 1;
  let newNo = 1;
  let truncated = false;
  for (const raw of patch.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
    if (raw.startsWith('@@')) {
      const range = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldNo = range ? Number(range[1]) : 1;
      newNo = range ? Number(range[2]) : 1;
      lines.push({ kind: 'hunk', text: raw });
      active = true;
      continue;
    }
    if (raw.startsWith('... [preview truncated:')) { truncated = true; break; }
    if (!active || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) lines.push({ kind: 'add', text: raw.slice(1), newNo: newNo++ });
    else if (raw.startsWith('-')) lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++ });
    else if (raw.startsWith(' ') || raw === '') lines.push({ kind: 'context', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
  }
  return !active ? null : changeFromLines(path, lines, { basis, lineNumbers: basis === 'result' ? 'file' : 'fragment', truncated });
}

export function contentChange(path: string, content: string, note: string, operation: FileChange['operation'] = 'written'): FileChange {
  const text = content.replace(/\r\n/g, '\n').split('\n');
  if (text.at(-1) === '') text.pop();
  return changeFromLines(path, text.map((line, index) => ({ kind: 'context', text: line, newNo: index + 1 })), {
    basis: 'content', lineNumbers: 'fragment', note, operation,
  });
}

/** Codex patch file boundaries stay separate, including rename destinations. */
export function codexPatchChanges(patch: string): readonly FileChange[] {
  const raw = patch.replace(/\r\n/g, '\n').split('\n');
  const out: FileChange[] = [];
  for (let i = 0; i < raw.length; i++) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(raw[i] ?? '');
    if (!header) continue;
    const originalPath = header[2]!;
    let path = originalPath;
    const body: string[] = [];
    while (i + 1 < raw.length && !/^\*\*\* (?:Add|Update|Delete) File:|^\*\*\* End Patch/.test(raw[i + 1] ?? '')) {
      const line = raw[++i]!;
      if (line.startsWith('*** Move to: ')) path = line.slice(13);
      else if (!line.startsWith('*** End of File')) body.push(line);
    }
    if (header[1] === 'Delete') {
      out.push(contentChange(path, '', '缺少修改前内容，无法展示删除 diff。', 'deleted'));
    } else if (header[1] === 'Add') {
      const content = body.filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n');
      out.push(contentChange(path, content, '请求写入内容；创建或覆盖结果尚未确认。'));
    } else {
      const change = unifiedPatchChange(path, body.join('\n')) ?? contentChange(path, '', '缺少可展示的修改片段。');
      out.push(path === originalPath ? change : { ...change, operation: 'moved', fromPath: originalPath });
    }
  }
  return out;
}
