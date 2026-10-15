import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputerPreview } from './use-computer-preview';
import type { ToolPreviewState } from './tool-preview-state';
import type { ServiceManager } from '../services-host/service-manager';
import type { ToolingFacade } from './tooling-facade';

const mocks = vi.hoisted(() => ({ publish: vi.fn(), read: vi.fn() }));
vi.mock('../host-adapter/tauri-detect', () => ({ isTauri: () => true }));
vi.mock('../host-adapter/computer-preview-window', () => ({ publishComputerPreview: mocks.publish }));
vi.mock('./tool-result-store', () => ({ getToolResultStore: () => ({ readBinaryBytes: mocks.read }) }));
const screenshot: ToolPreviewState = {
  title: 'Screenshot', status: '已完成', detail: '真实工具返回', screenshotAt: 10,
  image: { id: 'shot', storage: 'ephemeral-tool-cache', path: '/cache/shot.png', mimeType: 'image/png', size: 8, sha256: 'digest' },
};
describe('computer observer transport', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.publish.mockResolvedValue(undefined); });
  it('transfers cache bytes to the observer and retains the picture across status updates', async () => {
    mocks.read.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    const { rerender } = renderHook(({ state }) => useComputerPreview(state, 'a'), { initialProps: { state: screenshot } });
    await waitFor(() => expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ dataUrl: 'data:image/png;base64,iVBORw==', screenshotAt: 10 })));
    rerender({ state: { ...screenshot, status: '执行中' } });
    await waitFor(() => expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ status: '执行中', dataUrl: 'data:image/png;base64,iVBORw==' })));
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it('does not publish a late screenshot after switching conversations', async () => {
    let resolveRead: ((bytes: Uint8Array) => void) | undefined;
    mocks.read.mockImplementation(() => new Promise<Uint8Array>(resolve => { resolveRead = resolve; }));
    const { rerender } = renderHook(({ state, scope }) => useComputerPreview(state, scope), { initialProps: { state: screenshot, scope: 'a' } });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    rerender({ state: { title: '电脑控制', status: '等待工具操作', detail: '新会话' }, scope: 'b' });
    await act(async () => { resolveRead?.(new Uint8Array([1])); });
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ title: '电脑控制', status: '等待工具操作', detail: '新会话', scope: 'b' }));
    expect(mocks.publish.mock.calls.every(([value]) => !value.dataUrl)).toBe(true);
  });
  it('publishes live physical frames without waiting for a Screenshot result or writing the image cache', async () => {
    const handlers = new Map<string, (value: unknown) => void>();
    const start = vi.fn(async (_params: { streamId?: string }) => ({ ok: true }));
    const stop = vi.fn(async () => ({ ok: true })), ack = vi.fn(async () => ({ ok: true }));
    const manager = { currentHealth: 'ready', onHealth: () => () => {},
      client: { onEvent: (name: string, callback: (value: unknown) => void) => { handlers.set(name, callback); return () => handlers.delete(name); } },
    } as unknown as ServiceManager;
    const facade = { computerPreviewStart: start, computerPreviewStop: stop, computerPreviewAck: ack } as unknown as ToolingFacade;
    const action: ToolPreviewState = { title: '点击', status: '执行中', detail: '操作按钮', turnId: 'turn', hasStarted: true };
    const { rerender } = renderHook(({ enabled, state }) => useComputerPreview(state, 'window-scope', {
      manager, facade, projectRoot: 'D:/task', conversationId: 'one', enabled, turnId: state.turnId,
    }), { initialProps: { enabled: true, state: action } });
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    const streamId = start.mock.calls[0]?.[0].streamId;
    act(() => handlers.get('tooling.computerPreviewFrame')?.({ scope: '["d:/task","one"]', streamId,
      seq: 1, timestamp: 200, data: 'aGVsbG8=', mimeType: 'image/jpeg', width: 2560, height: 1600,
      originX: -2560, originY: 0, cursorX: -1000, cursorY: 200 }));
    await waitFor(() => expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({
      dataUrl: 'data:image/jpeg;base64,aGVsbG8=', streamState: 'running', updatedAt: 200,
      frameGeometry: expect.objectContaining({ width: 2560, originX: -2560, cursorX: -1000 }),
    })));
    await waitFor(() => expect(ack).toHaveBeenCalledOnce());
    expect(mocks.read).not.toHaveBeenCalled();
    rerender({ enabled: false, state: { ...action, status: '已完成' } });
    await waitFor(() => expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({
      streamState: 'stopped', dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
    })));
    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ streamId }));
  });
});
