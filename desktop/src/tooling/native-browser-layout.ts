import type { NativeBrowserCommand } from '../host-adapter/native-browser'

interface PendingLayout {
  command: NativeBrowserCommand
  waiters: { resolve: () => void; reject: (error: unknown) => void }[]
}

/** One native call in flight and one latest resize per visibility/scope.
 * Hide/show and conversation changes remain ordered barriers. */
export function createNativeLayoutQueue(
  send: (command: NativeBrowserCommand) => Promise<unknown>,
  canShow: (scope: string) => boolean,
): (command: NativeBrowserCommand) => Promise<void> {
  const pending: PendingLayout[] = []
  let running = false
  const drain = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      while (pending.length) {
        const item = pending.shift()!
        try {
          if (item.command.visible !== true || canShow(item.command.scope)) await send(item.command)
          item.waiters.forEach(waiter => waiter.resolve())
        } catch (error) { item.waiters.forEach(waiter => waiter.reject(error)) }
      }
    } finally { running = false }
  }
  return command => new Promise<void>((resolve, reject) => {
    const last = pending.at(-1)
    if (last && last.command.scope === command.scope && last.command.visible === command.visible) {
      last.command = command
      last.waiters.push({ resolve, reject })
    } else pending.push({ command, waiters: [{ resolve, reject }] })
    void drain()
  })
}
