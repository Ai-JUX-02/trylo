import { expect, it } from 'vitest';
import { parseControlFrame } from './control-protocol';
import { capabilitiesFor } from '../runtime/cli-runtime-protocol';
import { classifyPlaywrightTool } from '../tooling/classifiers/playwright-classifier';
it('recognizes structured user questions as input rather than permission', () => {
  expect(parseControlFrame({ type: 'control_request', request_id: 'q1', request: {
    subtype: 'ask_user_question', questions: [{ id: 'style', header: '样式', question: '选择方向', multiSelect: true,
      options: [{ label: 'A', description: '方向 A' }, { label: 'B', description: '方向 B' }] }],
  } })).toMatchObject({ kind: 'input', requestId: 'q1', questions: [{ id: 'style', multiSelect: true }] });
});
it('enables actual v1 guidance while retaining one process per turn', () => {
  expect(capabilitiesFor('trylo-v1')).toMatchObject({ steering: true, warmReuse: false, prewarm: false });
});
it('prompts for a workspace HTML file without granting unrestricted file access', () => {
  const route = (url: string) => classifyPlaywrightTool({ profileId: 'code', packageId: 'playwright',
    toolName: 'mcp__trylo-browser__browser_navigate', input: { url }, permissionLevel: 'workspace_write',
    projectRoot: 'D:/work/game', conversationId: 'c', at: 100 });
  expect(route('file:///D:/work/game/index.html')).toMatchObject({ behavior: 'prompt' });
  expect(route('file:///C:/Windows/win.ini')).toMatchObject({ behavior: 'deny' });
  expect(route('javascript:alert(1)')).toMatchObject({ behavior: 'deny' });
});
