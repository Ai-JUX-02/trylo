import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Check, ChevronDown, UserRound, UsersRound } from 'lucide-react';
import type { CollaborationSurface } from './types';

export interface CollaborationSwitchProps {
  readonly value: CollaborationSurface;
  readonly onChange: (value: CollaborationSurface) => void;
  readonly disabled?: boolean;
  readonly onCompose?: () => void;
}

export function CollaborationSwitch(props: CollaborationSwitchProps): ReactElement {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const pick = (value: CollaborationSurface): void => {
    props.onChange(value); setOpen(false); anchor.current?.focus();
  };
  const Icon = props.value === 'person' ? UserRound : UsersRound;
  return <div ref={root} className="collaboration-switch" onKeyDown={(event) => {
    if (event.key === 'Escape') { setOpen(false); anchor.current?.focus(); }
  }}>
    <button ref={anchor} type="button" className="collaboration-switch__trigger" disabled={props.disabled}
      aria-label="协作方式" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon size={16} aria-hidden="true" /><span>{props.value === 'person' ? '个人' : '团队'}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div className="collaboration-switch__menu" role="menu" aria-label="协作方式">
      {(['person', 'team'] as const).map((value) => <button key={value} type="button" role="menuitemradio"
        aria-checked={props.value === value} onClick={() => pick(value)}>
        {value === 'person' ? <UserRound size={15} /> : <UsersRound size={15} />}
        <span>{value === 'person' ? '个人对话' : '团队协作'}</span>{props.value === value && <Check size={14} />}
      </button>)}
      {props.onCompose && <button type="button" role="menuitem" onClick={() => { props.onCompose?.(); setOpen(false); }}>
        <UsersRound size={15} /><span>用团队做这件事</span>
      </button>}
    </div>}
  </div>;
}
