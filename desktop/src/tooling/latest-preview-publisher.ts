import type { ComputerPreviewSnapshot } from '../host-adapter/computer-preview-window'

/** One in-flight IPC plus the newest pending picture; slow viewers never queue a video. */
export function createLatestPreviewPublisher(send: (snapshot: ComputerPreviewSnapshot) => Promise<void>) {
  let pending: { snapshot: ComputerPreviewSnapshot; done: Array<(success: boolean) => void> } | undefined
  let sending = false
  let disposed = false
  async function drain(): Promise<void> {
    sending = true
    while (pending && !disposed) {
      const item = pending
      pending = undefined
      let success = true
      try { await send(item.snapshot) } catch (error) { success = false; console.warn('电脑预览传输失败', error) }
      item.done.forEach(resolve => resolve(success))
    }
    sending = false
  }
  return {
    publish(snapshot: ComputerPreviewSnapshot): Promise<boolean> {
      if (disposed) return Promise.resolve(false)
      return new Promise(resolve => {
        if (pending) { pending.snapshot = snapshot; pending.done.push(resolve) }
        else pending = { snapshot, done: [resolve] }
        if (!sending) void drain()
      })
    },
    dispose(): void { disposed = true; pending?.done.forEach(resolve => resolve(false)); pending = undefined },
    resume(): void { disposed = false },
  }
}
