import type { JournalEvent } from "../../learning/domains/user/evidence-signal.js";
import type { Envelope } from "../../protocol/envelope.js";
import type { UserLearningRuntime } from "./runtime.js";

/**
 * journal → 用户学习的观察口。
 *
 * 它把 `protocol/envelope.ts::Envelope` 折成学习侧需要的那几个字段（kind /
 * eventId / sessionId / turnId / payload），**不改一个字节、不丢一个字段**：
 * `eventId` 就是「绑运行身份」的那个坐标（D6）。
 *
 * 为什么这份折叠住在组合层而不是表面层：两侧的**类型**是在这里碰面的——`Envelope`
 * 属于协议包，`JournalEvent` 属于学习域，而「谁认识谁」的接线权是组合层的
 * （`learning/domains/user/evidence-signal.ts` 刻意连一行 `protocol` 都不 import，
 * 就是为了让这件事只能在组合层发生）。生产路径（`host.ts` 的 `onEnvelope`）与
 * 整机用例走的是**同一个函数**：测试里手搓一份长得像的折法，两边一起写错也全绿。
 */
export function journalEventOf(envelope: Envelope): JournalEvent {
  return {
    kind: envelope.kind,
    eventId: envelope.eventId,
    ...(envelope.sessionId === undefined ? {} : { sessionId: envelope.sessionId }),
    ...(envelope.turnId === undefined ? {} : { turnId: envelope.turnId }),
    payload: envelope.payload,
  };
}

/** 一个只读的观察者：它读 journal，从不写它，也从不改变这一轮。 */
export function userLearningObserver(
  runtime: UserLearningRuntime,
): (envelope: Envelope) => void {
  return (envelope) => {
    runtime.capture(journalEventOf(envelope));
  };
}
