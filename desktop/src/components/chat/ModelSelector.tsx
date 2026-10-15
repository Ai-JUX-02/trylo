import { Check, ChevronDown } from 'lucide-react';
// Trylo Desktop — ModelSelector.
//
// A model picker chip in the InputBar's bottom action row.
// Lists the user's configured model plus the built-in free
// compute pool (grok via the local sub2api gateway), mirroring
// the opencode "your models + system models in one list" model.
//
// The user's OWN model (`configuredModel`, = settings.apiModel) is
// NEVER overwritten. Selecting a pool model only sets `poolModel`
// (settings.poolModel); the effective model for a run is
// poolModel || configuredModel, so switching pool↔own always
// round-trips and the user can always switch back.
//
// The popover renders through a portal with the same anchored
// placement as ModePopover (flips above/below the chip so it is
// never clipped by the viewport top). Rows are grouped under
// "我的配置" / "免费算力池" headings; keyboard navigation walks the
// flat option order, which the grouping preserves.
//
// Interactions: click the chip to toggle, click outside or press
// Escape to close, Arrow keys + Enter to navigate.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

export type ModelChoice = { readonly id: string; readonly label: string; readonly hint: string };

/**
 * Built-in free-compute model pool. Keep in sync with the CLI's
 * `trylo cli/src/utils/model/poolModels.ts` (TRILO_BUILTIN_POOL).
 */
const BUILTIN_MODELS: readonly ModelChoice[] = [
  { id: 'grok-4.5', label: 'Grok 4.5', hint: '内置免费算力池' },
];

/** Sentinel indicating "use your own configured model" in the listbox. */
const OWN_MODEL_ID = '__trylo_own__';

/** Prefix distinguishing saved profiles (cfg- ids) from builtin pool ids. */
const PROFILE_PREFIX = 'profile:';

/** Which group a row belongs to; drives the section headings. */
type ModelGroup = 'mine' | 'pool';

/** Group order in the listbox. The flat option list is built in this order. */
const GROUPS: readonly { readonly key: ModelGroup; readonly title: string }[] = [
  { key: 'mine', title: '我的配置' },
  { key: 'pool', title: '免费算力池' },
];

/** Human label for a model id (builtin names resolved, own names kept). */
export function labelForModel(model: string): string {
  if (!model) return '默认';
  const builtin = BUILTIN_MODELS.find((b) => b.id === model);
  if (builtin) return builtin.label;
  return model;
}

export interface ModelSelectorProps {
  /** The user's own configured model (settings.apiModel; '' = none). */
  readonly configuredModel: string;
  /** Active built-in pool override (settings.poolModel; '' = not on pool). */
  readonly poolModel: string;
  /** Saved connection profiles (settings.modelProfiles) as listbox options;
   *  each carries the profile id in `id`. */
  readonly savedProfiles?: readonly ModelChoice[];
  /** The active profile id (settings.activeModelProfileId; '' = none). */
  readonly activeProfileId?: string;
  /** Switch back to the user's own configured model (clear poolModel). */
  readonly onSelectConfigured: () => void;
  /** Activate a built-in pool model (set poolModel). */
  readonly onSelectPool: (model: string) => void;
  /** Load a saved profile into the active connection. */
  readonly onSelectProfile?: (id: string) => void;
}

export function ModelSelector(props: ModelSelectorProps): ReactElement {
  const {
    configuredModel,
    poolModel,
    savedProfiles = [],
    activeProfileId = '',
    onSelectConfigured,
    onSelectPool,
    onSelectProfile,
  } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeProfile = savedProfiles.find((p) => p.id === activeProfileId);

  // Flat option list: your own model, then saved profiles, then the
  // builtin pool. Keyboard focus indexes into THIS array; the render
  // groups rows under headings without reordering them.
  const choices = useMemo<readonly (ModelChoice & { readonly group: ModelGroup })[]>(() => {
    const own: ModelChoice & { readonly group: ModelGroup } = {
      id: OWN_MODEL_ID,
      label: configuredModel ? labelForModel(configuredModel) : '默认模型',
      hint: activeProfile
        ? `已配置模型 · ${activeProfile.label}`
        : configuredModel
          ? '已配置模型'
          : '未配置，用 CLI 默认',
      group: 'mine',
    };
    const profiles = savedProfiles.map(
      (p): ModelChoice & { readonly group: ModelGroup } => ({
        id: `${PROFILE_PREFIX}${p.id}`,
        label: p.label,
        hint: p.hint,
        group: 'mine',
      }),
    );
    const pool = BUILTIN_MODELS.map(
      (b): ModelChoice & { readonly group: ModelGroup } => ({ ...b, group: 'pool' }),
    );
    return [own, ...profiles, ...pool];
  }, [configuredModel, savedProfiles, activeProfile]);

  const currentPoolId = poolModel.trim();
  const currentId = currentPoolId
    ? currentPoolId
    : activeProfile
      ? `${PROFILE_PREFIX}${activeProfile.id}`
      : OWN_MODEL_ID;
  const currentIndex = Math.max(
    0,
    choices.findIndex((c) => c.id === currentId),
  );
  const [focusIndex, setFocusIndex] = useState(currentIndex);

  // Fresh-value mirrors. The document-level keydown listener is bound
  // once per open (deps [open]); without these it would close over the
  // focusIndex/choices of the render that opened the popover — arrow
  // keys moved the highlight while Enter re-picked the row that was
  // current at open time.
  const focusIndexRef = useRef(focusIndex);
  focusIndexRef.current = focusIndex;
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  const onSelectRef = useRef<{
    own: () => void;
    pool: (id: string) => void;
    profile: ((id: string) => void) | undefined;
  }>({ own: onSelectConfigured, pool: onSelectPool, profile: onSelectProfile });
  const onCloseRef = useRef(() => setOpen(false));
  onSelectRef.current = {
    own: onSelectConfigured,
    pool: onSelectPool,
    profile: onSelectProfile,
  };
  onCloseRef.current = () => setOpen(false);

  const pick = (id: string): void => {
    if (id === OWN_MODEL_ID) onSelectRef.current.own();
    else if (id.startsWith(PROFILE_PREFIX)) onSelectRef.current.profile?.(id.slice(PROFILE_PREFIX.length));
    else onSelectRef.current.pool(id);
    onCloseRef.current();
  };

  useEffect(() => {
    if (!open) return;
    setFocusIndex(currentIndex);
  }, [open, currentIndex]);

  // Anchored placement: portal to body, flip above/below the chip —
  // mirrors ModePopover's layout effect so the popover is never
  // clipped by the viewport top or a short window.
  useLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const menu = listRef.current;
      const anchor = anchorRef.current;
      if (!menu || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      const down = below >= menu.scrollHeight || below > above;
      const maxHeight = Math.max(96, down ? below : above);
      const height = Math.min(menu.scrollHeight, maxHeight);
      Object.assign(menu.style, {
        left: `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`,
        top: `${down ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)}px`,
        maxHeight: `${maxHeight}px`,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null;
      if (!t) return;
      if (anchorRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((i) => (i + 1) % choicesRef.current.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((i) => (i - 1 + choicesRef.current.length) % choicesRef.current.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const c = choicesRef.current[focusIndexRef.current];
        if (c) pick(c.id);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // Listeners stay bound for the whole open session; fresh values
    // arrive through the refs above. `pick` closes the popover, which
    // re-runs this guarded effect on the next open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chipLabel = poolModel.trim()
    ? labelForModel(poolModel)
    : activeProfile
      ? activeProfile.label
      : configuredModel
        ? labelForModel(configuredModel)
        : '默认模型';

  return (
    <div className="model-selector">
      <button
        ref={anchorRef}
        type="button"
        className="model-selector__chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${chipLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-selector__chip-label">{chipLabel}</span><ChevronDown size={12} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            className="model-selector__popover mode-popover mode-popover--anchored"
            role="listbox"
            aria-label="Select model"
            tabIndex={-1}
          >
            {GROUPS.map((group, groupIndex) => {
              const rows = choices.filter((c) => c.group === group.key);
              if (rows.length === 0) return null;
              return (
                <div key={group.key} role="group" aria-label={group.title}>
                  {groupIndex > 0 && <div className="model-selector__divider" />}
                  <span className="model-selector__group-heading">{group.title}</span>
                  <ul className="model-selector__list" role="presentation">
                    {rows.map((c) => {
                      const i = choices.indexOf(c);
                      const active = i === focusIndex;
                      const current = c.id === currentId;
                      return (
                        <li
                          key={c.id}
                          role="option"
                          aria-selected={current}
                          className={`model-selector__item${active ? ' model-selector__item--focus' : ''}${current ? ' model-selector__item--current' : ''}`}
                          onMouseEnter={() => setFocusIndex(i)}
                          onClick={() => pick(c.id)}
                        >
                          <span className="model-selector__check" aria-hidden="true">
                            {current && <Check size={14} />}
                          </span>
                          <span className="model-selector__label">{c.label}</span>
                          <span className="model-selector__hint">{c.hint}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
