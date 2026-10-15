import type { ReactElement } from 'react';
export { LandingSuggestions } from './LandingSuggestions';

export interface LandingSuggestion {
  readonly label: string;
  readonly value: string;
  readonly id?: string;
}

export interface LandingSurfaceProps {
  readonly headline: string;
  readonly subtitle?: string;
}

export function LandingSurface(props: LandingSurfaceProps): ReactElement {
  return <div className="landing-surface">
    <h1 className="landing-surface__headline">{props.headline}</h1>
    {props.subtitle && <p className="landing-surface__subtitle">{props.subtitle}</p>}
  </div>;
}
