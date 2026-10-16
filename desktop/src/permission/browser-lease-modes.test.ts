// @vitest-environment node
import { expect, it } from 'vitest';
import { BrowserOriginLeases, classifyPlaywrightTool } from '../tooling/classifiers/playwright-classifier';
import { classifyChromeDevtoolsTool } from '../tooling/classifiers/chrome-devtools-classifier';

it.each([
  { name: 'Playwright', classify: classifyPlaywrightTool, toolName: 'mcp__trylo-browser__browser_navigate' },
  { name: 'Chrome', classify: classifyChromeDevtoolsTool, toolName: 'mcp__trylo-chrome__navigate_page' },
])('$name does not reuse automatic-edit grants at ask/read-only', ({ classify, toolName }) => {
  const leases = new BrowserOriginLeases();
  leases.grant({ kind: 'browser-origin', origin: 'https://example.com', actionClass: 'navigate', conversationId: 'c', ttlMs: 300000 }, 0);
  for (const level of ['ask', 'read_only'] as const) {
    const context = { profileId: 'code.core.v1', packageId: 'browser', toolName, input: { url: 'https://example.com/page' },
      projectRoot: 'D:/work/project', conversationId: 'c', permissionLevel: level, at: 1 };
    expect(classify(context, { leases }).behavior).toBe('prompt');
    expect(classify({ ...context, permissionLevel: 'workspace_write' }, { leases }).behavior).toBe('auto_allow');
  }
});
