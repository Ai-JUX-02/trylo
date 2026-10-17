export interface LearningDocument {
  name: string
  content: string
  source: string
  diff?: string
  metadata?: string
  approvalIssue?: string
}

/** Snapshot blocks include Hermes' prompt banner. Remove only that known
 * envelope for reading; source always retains the complete backend response. */
export function snapshotDocument(source: string, target: 'memory' | 'user'): LearningDocument {
  const label = target === 'memory' ? 'MEMORY' : 'USER'
  const banner = new RegExp(
    '^\\s*={3,}[ \\t]*\\r?\\n' +
      label +
      ' \\([^\\r\\n]*\\) \\[[^\\r\\n]*chars\\][ \\t]*\\r?\\n={3,}[ \\t]*(?:\\r?\\n|$)',
  )
  return { name: `${label}.md`, content: source.replace(banner, '').trim(), source }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Project the admin.py get_detail contract. Keep the complete response available
 * in source view, including operations that cannot be represented as Markdown. */
export function proposalDocument(
  detail: Record<string, unknown>,
  subsystem: 'memory' | 'skills',
): LearningDocument {
  const item = Object.keys(record(detail.item)).length ? record(detail.item) : detail
  const payload = record(item.payload)
  const content =
    typeof item.after === 'string'
      ? item.after
      : typeof item.content === 'string'
        ? item.content
        : typeof payload.content === 'string'
          ? payload.content
          : null
  const batch = payload.action === 'batch' || item.action === 'batch'
  const source = JSON.stringify(detail, null, 2)
  const security = record(item.security)
  const truncated = item.truncated === true || detail.truncated === true || item.complete === false
  const approvalIssue = truncated
    ? '详情内容不完整，请重新加载后再批准。'
    : batch && !Array.isArray(payload.operations)
      ? '后端未提供完整批量内容，请更新服务后重新加载。'
      : security.verdict === 'blocked' || security.verdict === 'dangerous'
        ? '后端检查阻止了此项写入，请查看写入详情。'
        : undefined
  const action = item.action ?? payload.action
  const name =
    subsystem === 'memory'
      ? item.target === 'user'
        ? 'USER.md'
        : 'MEMORY.md'
      : action === 'write_file' || action === 'remove_file'
        ? String(payload.file_path ?? payload.path ?? '提案文件')
        : action === 'delete'
          ? '删除技能'
          : 'SKILL.md'
  return {
    name,
    content: batch || content === null ? '```json\n' + source + '\n```' : content,
    source: batch || content === null ? source : content,
    diff: typeof item.diff === 'string' ? item.diff : undefined,
    metadata: source,
    approvalIssue,
  }
}

/** Frontmatter is metadata, retained in source view rather than typeset as body. */
export function markdownBody(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
}
