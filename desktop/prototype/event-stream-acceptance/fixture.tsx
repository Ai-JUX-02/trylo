import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Sun } from 'lucide-react';
import { CodeReasoningTranscript, type CodeProcessEntry } from '../../src/components/chat/CodeReasoningTranscript';
import type { ToolMessage, ThinkingMessage } from '../../src/components/chat/types';
import { IntegratedPreview } from './contrast-preview';
import { MixedThinkingPreview } from './mixed-thinking-preview';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/components/disclosure.css';
import '../../src/styles/components/message.css';
import '../../src/styles/components/tool-card.css';
import '../../src/styles/components/file-change-card.css';
import '../../src/styles/components/code-reasoning-transcript.css';
import '../../src/styles/components/event-flow.css';
import './fixture.css';

const tool = (id: string, name: string, input: Record<string, unknown>, outputText = '调用已返回。'): ToolMessage => ({
  id, kind: 'tool', role: 'assistant', createdAt: 100, tool: name, input, summary: JSON.stringify(input), status: 'done', outputText, durationMs: 480,
});
const thought = (id: string, text: string): ThinkingMessage => ({ id, kind: 'thinking', role: 'assistant', createdAt: 100, turn: 1, summary: text, preview: text, fullLength: text.length, partial: false });
const snapshot = tool('snapshot', 'mcp__trylo-windows__Snapshot', { use_ui_tree: false, use_vision: false }, 'Processes running but no Qoder window.');
const wait = { ...tool('wait', 'mcp__trylo-windows__Wait', { duration: 10 }, 'Waited 10 seconds.'), durationMs: 10000 };
const command = { ...tool('command', 'Bash', { command: 'tasklist | grep -i -c qoder', description: '检查 Qoder 进程' }, '0'), durationMs: 180 };
// Authored layout sample, not a recorded model trace. Same content in every view.
const longThought = [
  '窗口快照返回了进程仍在运行，但没有发现可见的主窗口。这个结果只能说明应用的进程存在，还不能确认主界面是否创建成功，也不能把“工具调用已完成”当作“Qoder 已正常启动”。',
  '先保持当前现场，等几秒后再检查一次。重复启动可能产生新的进程，也会让后续的进程数量失去参考意义。下一步需要核对的是窗口状态有没有变化，而不是立即重装或修改配置。',
  '复查时需要区分三种情况：\n\n- 进程仍在，窗口出现：继续确认窗口是否可以交互。\n- 进程仍在，没有窗口：检查启动日志与后台初始化状态。\n- 进程消失：记录退出前后的信息，再判断是否发生了启动崩溃。',
  'A running process is not the same as a visible application window. Keep the process check and the window check separate, then compare the observations from the same attempt.',
  '当前这组观察应保留为两项独立事实，避免后面的解释覆盖最初的结果：',
  '```text\nprocess_state: running\nvisible_main_window: not_found\n```',
  '等待结束后先重新查看窗口，再核对进程数量。若两次结果不同，就按实际变化继续检查；只有拿到新的返回结果，才能更新当前判断。原始输出也要保留，方便区分应用退出、窗口隐藏和工具本身失败。',
].join('\n\n');

function Fixture() {
  const [scene, setScene] = useState('long');
  const [mode, setMode] = useState('integrated');
  const [dark, setDark] = useState(false);
  const [tone, setTone] = useState(true);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  const qoder: CodeProcessEntry[] = [snapshot, thought('reason', '进程在运行但窗口还没出现，再等几秒看看。'), wait, command, thought('finding', 'Qoder processes are gone again (count 0).')];
  const entries: CodeProcessEntry[] = scene === 'running' ? [...qoder.slice(0, 2), { ...wait, status: 'running', durationMs: undefined, outputText: undefined }]
    : scene === 'error' ? [thought('error-reason', '先检查当前窗口和进程状态。'), { ...snapshot, status: 'error', outputError: '窗口查询连接已断开。', outputText: undefined }]
    : scene === 'stopped' ? [{ ...wait, status: 'interrupted', outputText: '等待被停止，本次窗口复查未完成。' }]
    : scene === 'diff' ? [thought('edit-reason', '调整窗口的初始可见状态。'), tool('edit', 'Edit', { file_path: 'D:/demo/src/app.ts', old_string: 'const visible = false;\nexport { visible };', new_string: 'const visible = true;\nexport { visible };' }, 'Updated src/app.ts')]
    : scene === 'thinking' ? [thought('standalone-thought', '先确认 Qoder 是否还在运行，再核对是否有可见窗口。\n\n如果进程存在但没有窗口，就等几秒复查；如果进程已经退出，再查看启动日志，避免反复启动。')]
    : scene === 'long' ? [snapshot, thought('long', longThought), wait, thought('long-followup', '等待结束后再复查进程，确认窗口是否出现。'), command]
    : qoder;
  const title = scene === 'running' ? '正在等待 Qoder 窗口'
    : scene === 'error' ? '窗口状态查询失败'
    : scene === 'stopped' ? '等待已停止，尚未复查'
    : scene === 'diff' ? '已调整窗口的初始可见状态'
    : scene === 'long' ? '检查进程与窗口状态'
    : '复查时 Qoder 进程数为 0';
  const previewProps = { entries, title, active: scene === 'running' };

  return <main className={tone ? 'acceptance-tone-on' : undefined}>
    <header className="acceptance-toolbar">
      <span className="acceptance-brand">Trylo <span>事件流预览</span></span>
      <div className="acceptance-modes" role="group" aria-label="对比版本">
        <button type="button" aria-pressed={mode === 'reading'} onClick={() => setMode('reading')}>A · 无底色</button>
        <button type="button" aria-pressed={mode === 'mixed'} onClick={() => setMode('mixed')}>上版色块</button>
        <button type="button" aria-pressed={mode === 'integrated'} onClick={() => setMode('integrated')}>已接线</button>
      </div>
      <label>场景<select aria-label="场景" value={scene} onChange={event => { setScene(event.target.value); if (event.target.value === 'icons') setMode('integrated'); }}>
        <option value="qoder">Qoder 检查</option><option value="thinking">独立思考</option><option value="icons">动作图标</option><option value="running">运行中</option><option value="error">调用失败</option><option value="stopped">已停止</option><option value="diff">文件差异</option><option value="long">长思考</option>
      </select></label>
      <button className="acceptance-tone-button" type="button" aria-pressed={tone} disabled={mode !== 'reading' || scene === 'icons'} onClick={() => setTone(value => !value)}>{tone ? '色差：开' : '色差：关'}</button>
      <button className="acceptance-theme" type="button" aria-label={dark ? '切换浅色' : '切换深色'} onClick={() => setDark(!dark)}>{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
    </header>
    <div className="acceptance-chat">
      <div className="acceptance-user">{scene === 'icons' ? '检查 SkillsModal 的接线与测试。' : '帮我打开 Qoder，看看为什么没有显示窗口。'}</div>
      <div className="message message--assistant acceptance-narration"><div className="message__text">{scene === 'icons' ? '我先检查组件、引用和测试。' : '我先检查 Qoder 的进程和窗口状态。'}</div></div>
      {scene === 'icons'
        ? <>
          <CodeReasoningTranscript entries={[tool('read-example', 'Read', { file_path: 'D:/demo/src/SkillsModal.tsx' })]} active={false} turnId="preview-user" phaseId="read-example" />
          <CodeReasoningTranscript entries={[thought('note-example', '组件已读完，接下来核对引用和测试。')]} active={false} turnId="preview-user" phaseId="note-example" />
          <CodeReasoningTranscript entries={[tool('search-example', 'Grep', { path: 'D:/demo/src', pattern: 'SkillsModal' })]} active={false} turnId="preview-user" phaseId="search-example" />
          <CodeReasoningTranscript entries={[tool('edit-example', 'Edit', { file_path: 'D:/demo/src/SkillsModal.test.tsx', old_string: 'expect(visible).toBe(false);', new_string: 'expect(visible).toBe(true);' })]} active={false} turnId="preview-user" phaseId="edit-example" />
          <CodeReasoningTranscript entries={[tool('command-example', 'Bash', { command: 'pnpm test SkillsModal', description: '核对 SkillsModal 的相关测试' })]} active={false} turnId="preview-user" phaseId="command-example" />
        </>
        : mode === 'integrated'
          ? <IntegratedPreview key={`${scene}-${mode}`} {...previewProps} />
          : <MixedThinkingPreview key={`${scene}-${mode}`} {...previewProps} appearance={mode === 'reading' ? 'reading' : 'surface'} />}
      {scene === 'qoder' && <div className="acceptance-result"><strong>Qoder 已退出，当前没有可见窗口</strong><p>复查时进程数量为 0，启动问题仍未解决。下一步可以查看启动日志，确认退出原因。</p></div>}
    </div>
    <footer className="acceptance-note">{scene === 'long' ? '多段排版示例 · 非真实任务思考 · 不执行工具' : '示例数据，仅预览界面'}</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
