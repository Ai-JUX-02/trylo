// Local acceptance fixture: the real gateway, with an in-memory Desktop authority.
// Every task/result here is synthetic; no shell command or model is executed.
const { createRemoteGateway } = require('../../vendor/legacy/remote-gateway/index.js');
const TOKEN = 'local-mobile-ui-fixture-token-20261011-00000000';
function createFixture(port = 49404) {
  let activeSessionId = 'code-initial';
  let pendingTurn = '';
  let count = 0;
  const sessions = [{ id: activeSessionId, title: '手机端 UI 更新', surface: 'code', updatedAt: Date.now() }];
  const history = new Map([[activeSessionId, []]]);
  let gateway;
  const publishSession = () => gateway.publish({ type: 'sessionState', activeSessionId, sessions, conversation: history.get(activeSessionId) || [] });
  const settle = allowed => {
    const at = Date.now();
    gateway.publish({ type: 'permissionRequestState', requests: [] });
    if (allowed) {
      gateway.publish({ type: 'trace', id: `${pendingTurn}:tool:build`, turnId: pendingTurn, toolCallId: 'build', kind: 'tool', title: 'Bash', phase: 'completed', output: 'Fixture build passed. Exit code 0.', durationMs: 120, at });
      gateway.publish({ type: 'turnFinished', turn: { id: pendingTurn, resultText: '界面调整已完成，构建通过。这是本机验收数据。', completedAt: at }, at });
      gateway.publish({ type: 'assistant', at });
    } else gateway.publish({ type: 'stopped', at });
    history.set(activeSessionId, gateway.getSnapshot().conversation);
  };
  gateway = createRemoteGateway({ port, host: '127.0.0.1', authToken: TOKEN, deviceName: '本机验收电脑', workspaceName: 'Trylo', handlers: {
    session: async payload => {
      history.set(activeSessionId, gateway.getSnapshot().conversation);
      if (payload.create) {
        activeSessionId = `${payload.surface}-${++count}`;
        sessions.unshift({ id: activeSessionId, title: '新对话', surface: payload.surface, updatedAt: Date.now() });
        history.set(activeSessionId, []);
      } else {
        if (!history.has(payload.sessionId)) throw new Error('Session missing');
        activeSessionId = payload.sessionId;
      }
      publishSession(); return { accepted: true, sessionId: activeSessionId, switching: false };
    },
    projects: async () => ({ projects: [{ id: 'trylo', name: 'Trylo' }], activeProjectId: 'trylo' }),
    project: async () => ({ accepted: true }),
    task: async payload => {
      pendingTurn = `fixture-${++count}`;
      const at = Date.now();
      gateway.publish({ type: 'agentState', state: 'running', at });
      gateway.publish({ type: 'turnStarted', turn: { id: pendingTurn, prompt: payload.text, startedAt: at }, at });
      gateway.publish({ type: 'turnEvent', turnId: pendingTurn, event: { category: 'reasoning', title: '梳理会话与侧栏布局', detail: '保持对话入口简洁，读取文件后核对品牌标识。', status: 'done' }, at: at + 1 });
      gateway.publish({ type: 'trace', id: `${pendingTurn}:tool:read`, turnId: pendingTurn, toolCallId: 'read', kind: 'tool', title: 'Read', input: '{"file_path":"mobile-app/src/App.tsx"}', phase: 'running', at: at + 2 });
      gateway.publish({ type: 'trace', id: `${pendingTurn}:tool:read`, turnId: pendingTurn, toolCallId: 'read', kind: 'tool', title: 'Read', output: 'Fixture: conversation layout loaded.', phase: 'completed', durationMs: 20, at: at + 3 });
      if (/fail/i.test(payload.text)) {
        gateway.publish({ type: 'trace', id: `${pendingTurn}:tool:failed`, turnId: pendingTurn, toolCallId: 'failed', kind: 'tool', title: 'Bash', input: '{"command":"fixture-failure"}', output: 'Fixture error: exit 1', phase: 'failed', at: at + 4 });
        gateway.publish({ type: 'error', message: '本机验收：运行失败', at: at + 5 });
      } else {
        gateway.publish({ type: 'trace', id: `${pendingTurn}:tool:build`, turnId: pendingTurn, toolCallId: 'build', kind: 'tool', title: 'Bash', input: '{"command":"npm.cmd run build"}', phase: 'running', at: at + 4 });
        gateway.publish({ type: 'permissionRequestState', requests: [{ requestId: 'fixture-approval', category: 'command', title: '执行构建命令', detail: 'npm.cmd run build', description: '本机验收请求，不会实际运行命令。', at: at + 5 }] });
      }
      history.set(activeSessionId, gateway.getSnapshot().conversation);
      return { accepted: true, requestId: payload.requestId, surface: payload.surface };
    },
    permission: async ({ decision }) => { settle(decision === 'allow'); return { ok: true }; },
    cancel: async () => { settle(false); return { ok: true }; },
    artifacts: async () => ({ artifacts: [{ id: 'report.md', name: 'report.md', kind: 'document', size: 35, modifiedAt: Date.now() }] }),
    artifact: async () => ({ name: 'report.md', mimeType: 'text/plain', data: Buffer.from('# Fixture report\nUI acceptance passed.').toString('base64') }),
  } });
  return { gateway, token: TOKEN, initialize() { gateway.publish({ type: 'projectsState', projects: [{ id: 'trylo', name: 'Trylo' }], activeProjectId: 'trylo' }); publishSession(); } };
}
module.exports = { createFixture, TOKEN };
if (require.main === module) {
  const fixture = createFixture();
  fixture.gateway.start().then(() => { fixture.initialize(); console.log('Local acceptance gateway: http://127.0.0.1:49404'); });
  process.on('SIGINT', () => fixture.gateway.stop().then(() => process.exit(0)));
}
