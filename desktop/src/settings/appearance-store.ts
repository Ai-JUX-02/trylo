import { useSyncExternalStore } from 'react';

export type Appearance = 'light' | 'dark' | 'system';
const KEY = 'trylo.appearance.v1';
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let preference: Appearance = 'light';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'dark' || saved === 'system') preference = saved;
} catch { /* A restricted webview can still use a session preference. */ }

export function resolvedAppearance(): 'light' | 'dark' {
  return preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
}

function apply(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolvedAppearance();
  listeners.forEach((listener) => listener());
}

export function setAppearance(value: Appearance): void {
  preference = value;
  try { localStorage.setItem(KEY, value); } catch { /* See session fallback above. */ }
  apply();
}

media?.addEventListener('change', apply);
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  preference = event.newValue === 'dark' || event.newValue === 'system' ? event.newValue : 'light';
  apply();
});
apply();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAppearance(): { preference: Appearance; theme: 'light' | 'dark' } {
  const snapshot = useSyncExternalStore(subscribe, () => `${preference}:${resolvedAppearance()}`);
  const [choice, theme] = snapshot.split(':') as [Appearance, 'light' | 'dark'];
  return { preference: choice, theme };
}
