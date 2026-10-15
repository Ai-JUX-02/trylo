// Trylo Desktop — model-mentioned file path resolution.
//
// A final answer names files the way a person would: sometimes a clean
// workspace-relative path (`docs/report.md`), sometimes a bare basename
// (`report.md`). The old resolution was a naive root-join, so a basename
// whose real file lives in a subdirectory opened the (missing)
// `<root>/<basename>` and read as a 404 — worse when two same-name files
// exist in different dirs (Round-3 P2: 同名不同文件被当 404).
//
// The fallback is deliberately narrow: a bare basename resolves against the
// file paths THIS conversation's tools actually touched (newest first), so
// `report.md` opens the file the agent just wrote, not a same-name
// stranger. A mention that already carries a directory is resolved
// verbatim — never guessed. Anything absolute/traversing is rejected, same
// as before.

/** File-ish fields the CLI tool inputs carry (see events.ts `toolSummary`). */
const PATH_FIELDS = ['file_path', 'path', 'file'] as const;

function cleanSegment(part: string): boolean {
  return part !== '' && part !== '.' && part !== '..';
}

/** Workspace-relative join. Null for absolute / traversal / empty input. */
export function joinRoot(root: string, rel: string): string | null {
  const normalized = rel.replace(/\\/g, '/').trim().replace(/^["']|["']$/g, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => !cleanSegment(part))) return null;
  const clean = parts.filter((part) => part !== '');
  if (clean.length === 0) return null;
  return `${root.replace(/[\\/]+$/, '')}/${clean.join('/')}`;
}

function basenameOf(p: string): string {
  const m = p.replace(/\\/g, '/').match(/[^/]+$/);
  return m ? m[0]! : p;
}

/** Newest-first file paths this conversation's tools touched. */
export function toolPathsOf(
  messages: readonly {
    readonly kind: string;
    readonly input?: unknown;
  }[],
): readonly string[] {
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.kind !== 'tool') continue;
    const input = m.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
    const obj = input as Record<string, unknown>;
    for (const field of PATH_FIELDS) {
      const value = obj[field];
      if (typeof value === 'string' && value.trim() !== '') out.push(value.trim());
    }
  }
  return out;
}

/**
 * Resolve a model-mentioned path to an absolute workspace path.
 *
 * Bare basenames fall back to the newest same-name tool path in this
 * conversation; everything else resolves verbatim. Null when the mention
 * itself is unresolvable (absolute / traversal) — the caller keeps its
 * previous behaviour for that case.
 */
export function resolveMentionPath(
  root: string,
  mention: string,
  toolPaths: readonly string[],
): string | null {
  const normalized = mention.replace(/\\/g, '/').trim().replace(/^["']|["']$/g, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null;
  const hasDir = normalized.split('/').filter((p) => p !== '').length > 1;
  if (hasDir) return joinRoot(root, normalized);
  const want = normalized.toLowerCase();
  for (const candidate of toolPaths) {
    const cand = candidate.replace(/\\/g, '/').trim();
    if (cand === '') continue;
    if (basenameOf(cand).toLowerCase() !== want) continue;
    // Absolute tool path under this root: use it; otherwise treat as
    // workspace-relative. A tool path outside the root is not ours to open.
    if (/^[a-z]:/i.test(cand) || cand.startsWith('/')) {
      const rootPrefix = root.replace(/\\/g, '/').replace(/[\\/]+$/, '').toLowerCase();
      if (cand.toLowerCase().startsWith(`${rootPrefix}/`)) return cand;
      continue;
    }
    const joined = joinRoot(root, cand);
    if (joined) return joined;
  }
  return joinRoot(root, normalized);
}
