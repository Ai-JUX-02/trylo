/**
 * 后台 worker：把「躺在队列里的一句话」变成「真跑过的一轮」（WP26 / A04）。
 *
 * ## 它补的是哪个洞
 *
 * 调度 daemon（A06）只负责**投递**：cron 到点、或者 watch 条件转真时，它把
 * prompt 追加进那个会话的队列就停了。在那之前，**只有前台 TUI 会消费这个队列**
 * —— `createIdleDispatch` 是被 TUI 循环调用的，所以人一关终端，调度器排队的东西
 * 就全躺在磁盘上没人跑。
 *
 * worker 是这件事的后台一半：同一个队列、同一套单写者规矩，但不需要前台在场。
 *
 * ## 为什么它不是「第二套后台总管」
 *
 * ADR §5：「同一主机少量共享执行 owner，不按十项另建十套后台总管」。所以 worker
 * **不拿自己的租约、不建自己的记录文件、不开自己的停止通道** —— 它跑在同一个
 * daemon 进程的同一个 tick 里，队列与执行器都由外部注入。
 *
 * ## 为什么「领取」是先把消息删掉
 *
 * 消息在**跑之前**就从队列里移除，不是跑完之后。若改成跑完再删，那么一轮失败
 * （或进程在半途被杀）会让那条消息既没被回答、又还在队列里 —— 下一趟会把它再
 * 跑一遍，同一个问题被回答两次，而且连痕迹都没有。先删的失败后果是「这一条丢了」，
 * 这在 `trylo queue list` 里看得见。
 *
 * 两个 worker 抢同一条队首也因为这个规矩而安全：第二个 `delete` 会报
 * `unknown_item`，而**没领到消息的 worker 拒绝执行它**。
 *
 * ## 为什么 executor 是注入的
 *
 * 「跑一轮」要用既有的 Session / Permission owner，worker 自己不持有它们（规格：
 * 「独立 worker 不重复 Session/Permission owner」）。所以执行器是一个端口，生产上
 * 由 composition root 接到既有执行体系，测试里换成假的。这让 worker 的全部不变式
 * 都能在没有 provider、没有 TTY 的情况下被测到。
 */

import type { QueueFailureCode } from "./background-queue.js";

/** 一轮的结局。`unknown` 表示副作用可能落了也可能没落，不自动重做（ADR §收口）。 */
export type WorkerOutcome = "completed" | "failed" | "cancelled" | "unknown";

/** 被领走的一条活。id 稳定，便于回执与列表对上号。 */
export type WorkerJob = {
  readonly sessionId: string;
  readonly messageId: string;
  readonly text: string;
  /** 入队时刻，先进先出。 */
  readonly enqueuedAtMs: number;
};

/** executor 交回的结局。 */
export type WorkerTurnResult = {
  readonly outcome: WorkerOutcome;
  /**
   * 执行 owner 那边的标识（进程会话 id 之类）。
   *
   * 拿到了它，才可以说「这条已经不在我手上了」；拿不到，就说明交接根本没发生，
   * 队列项必须留着。崩溃之后靠它去问 owner「你收到没有」。
   */
  readonly ownerRef?: string;
  readonly detail?: string;
};

/**
 * 交接的三种落点。
 *
 * 命名成「收到了 / 没收到 / 不知道」，而不是「成功 / 失败」，是因为崩溃之后真正
 * 要回答的是**副作用有没有发生**：
 *
 * - `received`：owner 确实收下了 → 补上确认，把队列项删掉
 * - `not_received`：确实没收到 → 可以再交一次，这是安全的
 * - `unknown`：查不出来 → **不自动重做**。重做一个「可能已经跑过」的任务，
 *   比丢一条更糟；这交给人在 `trylo queue list` 里看清楚再决定。
 */
export type HandoffProbe = "received" | "not_received" | "unknown";

/**
 * 执行 owner —— worker 把活交给它。
 *
 * 分成两个动作而不是一个，是因为「交出去」和「知不知道交成了」在崩溃面前是两件
 * 事：`execute` 可能已经让 owner 收下、却在回话之前进程就死了，这时只有 `probe`
 * 能回答队列项该不该删。
 */
export type WorkerExecutionOwner = {
  readonly execute: (job: WorkerJob) => Promise<WorkerTurnResult>;
  /** 问 owner：这个标识的活，你到底收下没有。 */
  readonly probe: (ref: string) => Promise<HandoffProbe>;
};

/**
 * 一条交接记录的状态。
 *
 * `handing_off` 是**崩溃窗口**：记录写了、队列项还在，谁也不知道 owner 收没收到。
 * 它存在的意义就是让这个窗口在重启之后还看得见 —— 没有它，「我到底交没交」
 * 就只能靠猜，而猜错的两个方向分别是「再跑一遍」和「悄悄丢掉」。
 */
export type HandoffState = "handing_off" | "acked" | "unknown";

export type HandoffRecord = {
  readonly sessionId: string;
  readonly messageId: string;
  readonly text: string;
  readonly state: HandoffState;
  readonly startedAtMs: number;
  readonly worker: WorkerIdentity;
  /** 执行 owner 给的标识；只有拿到了它才谈得上确认。 */
  readonly ownerRef?: string;
  readonly detail?: string;
};

/**
 * 真正跑一轮的东西，由外部注入。
 *
 * 它内部会用既有的 Session / Permission owner；worker 只负责「领、记、取消」，
 * 不复制那两个 owner。
 */
export type WorkerExecutor = (job: WorkerJob) => Promise<WorkerTurnResult>;

/**
 * worker 的失败码。
 *
 * 大部分直接沿用队列的失败码，因为 worker 报的本来就是**队列的事实**（读不到、
 * 写不了、被锁着、队首没了），换成自己的一套只会让同一个失败有两个名字。
 * 另加两个属于自己的：`no_work`（队列空，正常状态）与 `executor_failed`。
 */
export type WorkerFailureCode =
  /** 队列是空的；这不是错误，是「此刻没活」。 */
  | "no_work"
  /** 执行器这一侧出了 worker 管不了的问题。 */
  | "executor_failed"
  | QueueFailureCode;

export type WorkerRefusal = {
  readonly ok: false;
  readonly code: WorkerFailureCode;
  readonly message: string;
};

export type WorkerResult<T> = { readonly ok: true; readonly value: T } | WorkerRefusal;

/**
 * 一个执行者的身份：pid 加上它自己的启动时刻。
 *
 * 只用 pid 是不够的 —— pid 会被复用，一个「pid 还在」的观察不能证明「还是那个
 * 进程」。启动时刻是让它变可靠的另一半（Codex `pid.rs:168,555` 同一个规矩）。
 */
export type WorkerIdentity = {
  readonly pid: number;
  readonly startedAtMs: number;
};

/** 一条活的终局事实，供 `ps` 类查询回答「它后来怎么样了」。 */
export type WorkerReceipt = {
  readonly sessionId: string;
  readonly messageId: string;
  readonly outcome: WorkerOutcome;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  /** 谁跑的它。回执要能回答「这条是现在的我还是上一任留下的」。 */
  readonly worker: WorkerIdentity;
  readonly detail?: string;
};

export type WorkerPort = {
  /**
   * 领走一个会话队列的队首。删在前面（见文件头），返回被领走的那条。
   *
   * `no_work` 表示队列为空 —— 调用方应当把它当「这次没活」，而不是失败。
   */
  readonly claim: (sessionId: string) => Promise<WorkerResult<WorkerJob>>;
  /** 把领到的活交给注入的执行器，并记录它的终局。 */
  readonly run: (job: WorkerJob) => Promise<WorkerResult<WorkerReceipt>>;
  /** 这个 worker 记下的所有结局，最老的在前。 */
  readonly receipts: () => Promise<ReadonlyArray<WorkerReceipt>>;
  /** 一趟最多领几条。防止一个 tick 被队列长度绑架。 */
  readonly budget: () => number;
  /**
   * 跑一趟：连续领取并执行，直到预算用尽、队列空、或者撞上一个必须停的失败。
   *
   * 返回领到并执行完的条数，以及（若有）让它停下的那个理由。分开报告是因为
   * 「跑了 2 条然后队列空了」和「跑了 2 条然后队列读不了了」对人意味着完全
   * 不同的下一步。
   */
  readonly pass: () => Promise<WorkerPass>;
};

/**
 * 一趟 worker pass 的结果。
 *
 * `taken` 是**领到并执行完**的条数，`refused` 是让它停下来的那个理由（没有则为 undefined）。
 * 分开的原因：领到 0 条可能是因为空队列（正常），也可能是因为队列读不了（要报），
 * 把两者合成一个「0」会让「没活」和「读不到」变成同一件事。
 */
export type WorkerPass = {
  readonly taken: number;
  readonly refused?: WorkerFailureCode;
};
