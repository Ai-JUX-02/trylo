import { describe, expect, it, vi } from 'vitest'
import { createLatestPreviewPublisher } from './latest-preview-publisher'
import type { ComputerPreviewSnapshot } from '../host-adapter/computer-preview-window'

const snapshot = (title: string): ComputerPreviewSnapshot => ({ title, status: '执行中', detail: '' })
describe('latest preview backpressure', () => {
  it('keeps one in-flight write and replaces pending frames with the newest', async () => {
    let finish: (() => void) | undefined
    const send = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const publisher = createLatestPreviewPublisher(send)
    publisher.publish(snapshot('first'))
    publisher.publish(snapshot('discarded'))
    publisher.publish(snapshot('newest'))
    expect(send).toHaveBeenCalledTimes(1)
    finish?.()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send).toHaveBeenNthCalledWith(2, snapshot('newest'))
    publisher.dispose()
    finish?.()
  })
  it('disposal discards queued frames and can resume under StrictMode', async () => {
    const send = vi.fn(async () => {})
    const publisher = createLatestPreviewPublisher(send)
    publisher.dispose()
    publisher.publish(snapshot('discarded'))
    expect(send).not.toHaveBeenCalled()
    publisher.resume()
    publisher.publish(snapshot('resumed'))
    await Promise.resolve()
    expect(send).toHaveBeenCalledWith(snapshot('resumed'))
  })
})
