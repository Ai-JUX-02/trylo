import type { ReactElement } from 'react';
import { defaultStarters } from '@trylo/work';
import type { CodeMode } from '../../host-adapter/types';
import { LandingSurface, LandingSuggestions, type LandingSuggestion } from '../landing/LandingSurface';

/* ── Code ──────────────────────────────────────────────────── */

const CODE_LANDING: Record<
  CodeMode,
  { suggestions: LandingSuggestion[] }
> = {
  chat: {
    suggestions: [
      { label: '了解项目', value: 'Help me understand this repository.' },
      { label: '定位问题', value: 'Find a bug in this codebase.' },
      { label: '实现功能', value: 'Implement a change in this project.' },
    ],
  },
  plan: {
    suggestions: [
      { label: 'Design the data model', value: 'Design the data model for this feature.' },
      { label: 'Outline a refactor', value: 'Outline a refactor of this module.' },
      { label: 'Plan the API', value: 'Plan the API surface for this service.' },
    ],
  },
  agent: {
    suggestions: [
      { label: '理解项目', value: '先帮我理解这个项目的结构和主要调用链。' },
      { label: '修复问题', value: '帮我定位并修复当前项目中的一个问题。' },
      { label: '先做规划', value: '先梳理需求并规划实现步骤，暂时不要修改文件。' },
    ],
  },
  cognition: {
    suggestions: [
      { label: 'Plan vs execute', value: '普通功能直接做，核心架构先计划并保留最终验证。' },
      { label: 'Work deliverables', value: '做 PPT 先出一版再改；对外方案必须先给我看结构。' },
      { label: 'Desktop', value: '电脑低风险你自己点，涉及账号先问我。' },
    ],
  },
};

export interface EmptyStateProps {
  readonly codeMode: CodeMode;
}

export function EmptyState(props: EmptyStateProps): ReactElement {
  return <LandingSurface headline={props.codeMode === 'cognition' ? 'Trylo 怎样与你合作？' : '今天，想推进什么？'} subtitle={props.codeMode === 'plan' ? '先梳理方案，再开始实现。' : '从一个想法开始，也可以接着上次的任务。'} />;
}

export function CodeStarters(props: EmptyStateProps & { readonly onSuggestion: (text: string) => void }): ReactElement {
  return <LandingSuggestions suggestions={CODE_LANDING[props.codeMode].suggestions} onSuggestion={(item) => props.onSuggestion(item.value)} />;
}

/* ── Work ──────────────────────────────────────────────────── */

// The four capability starters, downgraded to short pills.
const WORK_PILL_IDS = [
  'research_sources',
  'data_analysis',
  'file_organization',
  'deliverable',
] as const;

const WORK_PILL_LABELS: Record<string, string> = {
  research_sources: '研究资料',
  data_analysis: '分析数据',
  file_organization: '整理文件',
  deliverable: '创建成果',
};

export interface WorkLandingProps {
  /** When false, the credentials banner already covers this case. */
  readonly hasApiKey?: boolean;
  /** Writes the seed into the Work input; the user still reviews/sends. */
  readonly onPickStarter: (seed: string, starterId: string) => void;
}

export function WorkLanding(): ReactElement {
  return <LandingSurface headline="今天，想完成什么？" subtitle="研究、整理资料，或生成可以交付的成果。" />;
}

export function WorkStarters(props: WorkLandingProps): ReactElement | null {
  if (props.hasApiKey === false) return null;
  const starters = defaultStarters();
  const suggestions = WORK_PILL_IDS.flatMap((id) => {
    const starter = starters.find((item) => item.id === id);
    return starter?.starterSeed ? [{ label: WORK_PILL_LABELS[id] ?? starter.title, value: starter.starterSeed, id }] : [];
  });
  return <LandingSuggestions suggestions={suggestions} onSuggestion={(item) => props.onPickStarter(item.value, item.id ?? '')} />;
}
