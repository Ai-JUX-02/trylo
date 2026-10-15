import { Bug, FolderSearch, ListChecks } from 'lucide-react';
import type { LandingSuggestion } from './LandingSurface';

export function LandingSuggestions(props: {
  readonly suggestions: readonly LandingSuggestion[];
  readonly onSuggestion: (suggestion: LandingSuggestion) => void;
}): JSX.Element {
  return <div className="landing-suggestions" aria-label="开始一个任务">
    {props.suggestions.map((item, index) => {
      const Icon = [FolderSearch, Bug, ListChecks][index % 3] ?? FolderSearch;
      return <button key={item.id ?? item.label} type="button"
        onClick={() => props.onSuggestion(item)}><Icon size={14} aria-hidden="true" /><span>{item.label}</span></button>;
    })}
  </div>;
}
