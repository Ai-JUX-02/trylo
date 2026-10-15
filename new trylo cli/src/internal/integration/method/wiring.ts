import { createMethodBoard, type MethodBoard } from "../../learning/method/board.js";
import type { MethodEventSink } from "../../learning/method/port.js";
import { createMethodBoardWriter } from "./board-writer.js";

/**
 * 方法子系统的组合根。
 *
 * 规格 §9 要的次序是：**先有开关**，开关开了才构造档、才读一次、才造板；开关没
 * 开则一个对象都不造。这个文件就是那句「才」，而它把两件事说清楚：
 *
 *  - **名字只定一处。** 开关的取值是闭集 `["method"]`，写在 `LEARNING_SWITCH_METHOD`。
 *    规格原文是「命名在施工时定一次并只定一处」，所以别处不许再出现第二个字面量
 *    ——`isMethodLearning` 是唯一判据，`surface/cli/wiring.ts` 只传值不判值。
 *  - **`boardRoot` 由调用方给，不由本文件算。** 家目录的公式是
 *    `surface/cli/session-paths.ts::tryloHome`，唯一一份；`integration/**` 是一个
 *    比表面层更靠里的地方，在这里再拼一次路径就会出现第二个家（反方表 #19）。
 *
 * 板不在构造时读盘是不可接受的（`§7.3` 要求组合根 `load()` 一次），板在**每次**
 * 读档才是不可接受的（那会让每一拍的请求构建变成一次磁盘读）。两者的分界写在
 * `learning/method/board.ts`：构造即发起 `load()`，此后内存视图由写口同步更新。
 * 于是「开启但空档」的代价是**一次**读，而不是每拍一次。
 */

/**
 * 开关的唯一取值。
 *
 * 闭集只有一个成员，因为 M2 只有方法这一个子系统：将来若出现第二个，这里是
 * 一行联合类型，而不是一个布尔。
 */
export const LEARNING_SWITCH_METHOD = "method";

export type MethodLearningSwitch = typeof LEARNING_SWITCH_METHOD;

/**
 * 这个值开不开方法学习。
 *
 * `undefined` 与任何别的字符串都是「不开」——包括 `"off"`、`"true"`、`"Method"`
 * （大小写不做宽容：宽容会让一个拼错的值**静默**变成另一种行为，而开关的全部
 * 意义就是「我明确要它」）。
 */
export function isMethodLearning(value: string | undefined): value is MethodLearningSwitch {
  return value === LEARNING_SWITCH_METHOD;
}

export type MethodWiringInput = {
  /** 开关取值。缺席 = 不构造（默认路径）。 */
  readonly switch?: string | undefined;
  /** 档的根目录，由组合根用 `tryloHome(...) + "/learning/board"` 算出。 */
  readonly boardRoot: string;
  /** ISO-8601 时刻。学习层不读时钟，所以由组合根注入。 */
  readonly now: () => string;
  /** 板上决策写到哪里去。必填：没有 sink 的板是不可观察的板。 */
  readonly emit: MethodEventSink;
};

/**
 * 开关没开就是 `undefined`，开了就是一块**已经发起读档**的板。
 *
 * 返回 `undefined` 而不是一块空板，是为了让「关学习」这条路连一次 `load()` 都不
 * 发生——I1 要的字节级一致由「组合根拿不到端口」保证，而不是由空板的行为保证
 * （空板仍然会 `mkdirSync` 与试锁，那是两件可观察的事）。
 */
export function wireMethodLearning(input: MethodWiringInput): MethodBoard | undefined {
  if (!isMethodLearning(input.switch)) {
    return undefined;
  }
  return createMethodBoard({
    archive: createMethodBoardWriter(input.boardRoot),
    emit: input.emit,
    now: input.now,
  });
}
