// Trylo Desktop — RightRail. v1.17.
//
// The file tree, formerly crammed into the left rail's middle
// section, now lives here: a toggleable right-side panel. This
// is "Option A" from the UI redesign — keep the left rail
// focused on workspaces + conversation history, and give the
// file tree its own collapsible home so it doesn't fight for
// vertical space with the session list.
//
// The tree itself is the existing WorkspaceTree component, so
// behaviour (lazy loading, refresh, error states) is unchanged.

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { FolderTree, Maximize2, X } from 'lucide-react';
import type { FilePath } from '../../host-adapter/types';
import { WorkspaceTree } from './WorkspaceTree';

export interface RightRailProps {
  readonly preview?: ReactNode;
  readonly previewKey?: string | null;
  readonly onExpandPreview?: () => void;
  /** Whether the panel is visible. When false, render nothing. */
  readonly open: boolean;
  /** The workspace root whose files are shown. */
  readonly root: FilePath | null;
  /** Hide the panel. */
  readonly onClose: () => void;
  /** Click a file/folder in the tree. */
  readonly onSelectFile?: (path: FilePath, kind: 'file' | 'dir') => void;
}

export function RightRail(props: RightRailProps): ReactElement | null {
  const [tab, setTab] = useState<'files' | 'preview'>(props.previewKey ? 'preview' : 'files');
  useEffect(() => {
    if (props.previewKey) setTab('preview');
  }, [props.previewKey]);
  if (!props.open) return null;

  return (
    <aside className="right-rail" aria-label="Workspace files">
      <div className="right-rail__header">
        <span className="right-rail__title">
          <FolderTree size={12} strokeWidth={2.2} aria-hidden="true" />
          <span>结果</span>
        </span>
        {props.onExpandPreview && <button type="button" className="right-rail__close" aria-label="放大文件预览" title="放大文件预览" onClick={props.onExpandPreview}><Maximize2 size={15} /></button>}
        <button
          type="button"
          className="right-rail__close"
          onClick={props.onClose}
          title="Hide file tree"
          aria-label="Hide file tree"
        >
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="right-rail__tabs" role="tablist" aria-label="结果视图">
        <button type="button" role="tab" aria-selected={tab === 'preview'} aria-controls="result-preview" onClick={() => setTab('preview')}>预览</button>
        <button type="button" role="tab" aria-selected={tab === 'files'} aria-controls="result-files" onClick={() => setTab('files')}>文件</button>
      </div>
      <div id="result-preview" className="right-rail__body right-rail__preview" role="tabpanel" aria-label="预览" hidden={tab !== 'preview'}>
        {props.preview ?? <div className="right-rail__empty">选择文件或对话中的结果，在这里查看。</div>}
      </div>
      <div id="result-files" className="right-rail__body" role="tabpanel" aria-label="文件" hidden={tab !== 'files'}>
        {props.root ? <WorkspaceTree root={props.root} onSelect={(path, kind) => {
          if (kind === 'file') setTab('preview');
          props.onSelectFile?.(path, kind);
        }} /> : <div className="right-rail__empty">打开项目后即可查看文件。</div>}
      </div>
    </aside>
  );
}
