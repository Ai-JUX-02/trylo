import type { JsonObject } from "../protocol/envelope.js";

/**
 * 传输面端口（in-process）。
 *
 * 事实源是**投影器输出的帧流**，不是 envelope。envelope 是 domain 的事实，
 * 帧是「某个目标形状下的事实」。本端口的职责只有一件，学的是 cline hub 的
 * `hub-event-log.ts`（D5 §1.3、§9 第 2 条）：**入 log 时盖一个全局单调序号，
 * live 与 replay 复用同一批字节**。
 *
 * 三条不变量，全部有测试钉死：
 *
 * 1. `transportSequence` 是**传输层自己的计数器**，与 `Envelope.sequence`
 *    （per-attempt 单调序，`protocol/sequencer.ts`）以及 `producerSequence`
 *    是两个无关的数列。混用会让「重放某一次 attempt」和「重放某一条传输流」
 *    变得无法区分——所以本端口把 envelope 的序号降格成只读的追溯字段
 *    `sourceSequence`，它不参与排序。
 * 2. 先注册的订阅者能看到注册之后 append 的每一帧；append 之后才注册的订阅者
 *    **收不到历史**，只能靠 `replay` 取回。「live 不补发」是刻意的：log 才是
 *    事实源（cline 的取向），补发会让两条路径的字节集不同。
 * 3. `replay({sinceSequence})` 返回的帧与当时 live 收到的是**同一批字节**
 *    （`JSON.stringify` 相等），因为 log 存的就是盖章后的帧对象本身。
 *
 * 依赖方向：本模块**不**导入任何 `surface/**` 类型。投影器产出的是自己的帧
 * 类型，由 `surface/protocol/transport.ts` 降级成 {@link UnstampedFrame}。
 * 端口不认识 ACP 或 ag-ui，也就不会被任何一种目标形状绑架。
 *
 * 不做的事：WebSocket、TCP、HTTP、SSE、文件 journal（持久 log 属 P04 压缩/
 * 检查点包）。本端口的唯一 IO 是一段内存队列。
 */

export type TransportFrame = {
  /** 全局单调，从 0 开始，无空洞。**不是** `Envelope.sequence`。 */
  readonly transportSequence: number;
  /** 目标表面名（`"acp"` / `"agui"`），本端口不解释它。 */
  readonly surface: string;
  readonly body: JsonObject;
  /** 来源事件的坐标，供重放方回溯事实源。 */
  readonly eventId: string;
  readonly sourceSequence: number;
  readonly kind: string;
};

export type UnstampedFrame = Omit<TransportFrame, "transportSequence">;

export type TransportListener = (frame: TransportFrame) => void;

export type Unsubscribe = () => void;

export type ReplayRequest = {
  /**
   * **排他**下界：返回 `transportSequence > sinceSequence` 的帧，升序。
   *
   * 因为序号从 0 开始，`-1` 是文档化的「从头开始」哨兵值（否则第 0 帧不可达）。
   * 小于 -1、非整数、NaN、Infinity 一律显式失败为 `invalid_cursor`——
   * 静默当成 0 会让调用方以为自己拿到了全部历史。
   */
  readonly sinceSequence: number;
};

export type TransportFailureCode = "invalid_cursor";

export type ReplayResult =
  | {
      readonly ok: true;
      readonly frames: ReadonlyArray<TransportFrame>;
      /** 空 log 时为 -1；没有它就说不清「客户端是不是已经追平」。 */
      readonly latestSequence: number;
    }
  | { readonly ok: false; readonly code: TransportFailureCode; readonly detail: string };

export type TransportPort = {
  /** 盖章并广播。返回的帧与 live/replay 观察到的**是同一个对象**。 */
  readonly append: (frame: UnstampedFrame) => TransportFrame;
  /** 先注册后 append 才不丢；注册之前的帧不补发。 */
  readonly subscribe: (listener: TransportListener) => Unsubscribe;
  readonly replay: (request: ReplayRequest) => ReplayResult;
  readonly latestSequence: () => number;
};
