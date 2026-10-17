import type { ToolResultContent } from './tool-result-content';

export const FILE_MUTATION_SCHEMA = 'trylo.file-changes.v1';
export interface FileMutationFact {
  readonly path: string;
  readonly kind: 'created' | 'overwritten' | 'patched' | 'deleted' | 'moved';
  readonly from?: string;
  readonly preview?: string;
  readonly truncated?: boolean;
}
const MODES = new Set(['created', 'overwritten', 'patched', 'deleted', 'moved']);
function nonemptyPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}
/** Used at both wire and persisted-content boundaries, before rendering. */
export function isFileMutationFacts(value: unknown): value is readonly FileMutationFact[] {
  let characters = 0;
  return Array.isArray(value) && value.length <= 64 && value.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const v = item as Record<string, unknown>;
    characters += typeof v.preview === 'string' ? v.preview.length : 0;
    return nonemptyPath(v.path) && typeof v.kind === 'string' && MODES.has(v.kind)
      && (v.from === undefined || nonemptyPath(v.from))
      && (v.preview === undefined || typeof v.preview === 'string' && v.preview.length <= 64_000)
      && (v.truncated === undefined || typeof v.truncated === 'boolean') && characters <= 64_000;
  });
}
export function normalizeFileMutationFacts(value: unknown): readonly FileMutationFact[] | undefined {
  if (!isFileMutationFacts(value)) return undefined;
  return value.map(item => ({ path: item.path, kind: item.kind,
    ...(item.from === undefined ? {} : { from: item.from }),
    ...(item.preview === undefined ? {} : { preview: item.preview }),
    ...(item.truncated === undefined ? {} : { truncated: item.truncated }),
  }));
}
export function fileMutationFacts(content: readonly ToolResultContent[] | undefined): readonly FileMutationFact[] | undefined {
  const block = content?.find(item => item.type === 'structured' && item.schema === FILE_MUTATION_SCHEMA);
  return block?.type === 'structured' ? normalizeFileMutationFacts(block.value) : undefined;
}
