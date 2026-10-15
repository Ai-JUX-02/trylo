import { useState, type ReactNode } from 'react';
import { isTauri } from '../../host-adapter/tauri-detect';

export function AnswerLink(props: {
  readonly href?: string;
  readonly children: ReactNode;
  readonly onOpenArtifact?: (path: string) => void;
  readonly artifactHost?: import('@trylo/work').HostAdapter;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const href = props.href ?? '';
  const external = /^https?:\/\//i.test(href);
  return <>
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
      onClick={(event) => {
        if (!external && props.onOpenArtifact && href && !href.startsWith('#') && !/^[a-z][a-z\d+.-]*:/i.test(href)) {
          event.preventDefault();
          let path = href;
          try { path = decodeURI(href); } catch { /* Literal percent signs can belong to a filename. */ }
          props.onOpenArtifact(path);
        } else if (external && props.artifactHost && isTauri()) {
          event.preventDefault(); setError(null);
          void props.artifactHost.openFile(href).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : String(reason));
          });
        }
      }}>{props.children}</a>
    {error && <span className="answer-link__error" role="alert">无法打开链接：{error}</span>}
  </>;
}
