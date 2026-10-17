export type FileChangeTool = 'edit' | 'multiedit' | 'write' | 'notebookedit' | 'patch';
export interface DiffLine {
  readonly kind: 'add' | 'del' | 'context' | 'hunk';
  readonly text: string;
  readonly oldNo?: number;
  readonly newNo?: number;
}
export interface FileChange {
  readonly path: string;
  readonly fromPath?: string;
  readonly operation: 'created' | 'overwritten' | 'patched' | 'deleted' | 'moved' | 'written' | 'cell';
  readonly isNew: boolean;
  readonly additions: number;
  readonly deletions: number;
  readonly lines: readonly DiffLine[];
  readonly hunks: number;
  /** Content is readable, but has no before image from which to compute a diff. */
  readonly basis: 'request' | 'result' | 'content';
  readonly lineNumbers: 'file' | 'fragment';
  readonly truncated?: boolean;
  readonly note?: string;
}
