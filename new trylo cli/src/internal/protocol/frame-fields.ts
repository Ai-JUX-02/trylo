import type { JsonValue } from "./envelope.js";

/**
 * 帧体字段规格（frame field spec）。
 *
 * 这一层是 WP §4 P5「改映射必须改表，禁止投影器里隐藏分支」的机器化形式：
 * 「payload 的哪些字段、以什么形状、出现在目标协议的哪一段」被写成**数据**，
 * 而不是散落在投影器的 `switch` 里。投影器只做一件事——按规格逐项求值
 * （见 `surface/protocol/body.ts`）。
 *
 * 规格里没有列出的字段不会进入帧体。这不是丢信息：帧的 `source`
 * （`eventId`/`sequence`/`kind`）始终指向原始 envelope，需要完整 payload 的
 * 行用 `raw_payload` / `custom_envelope` 显式带上**已脱敏**的副本。
 *
 * 「形状对齐、类型自有」：这里的字段名是与 ACP / ag-ui 对照后手写的，
 * 没有复制任何上游 schema 代码，也没有引入上游类型。
 */

/**
 * 共享派生值。每一个名字在 `surface/protocol/body.ts` 里有且只有一处实现；
 * 新增派生值必须同时改 `FRAME_DERIVATIONS` 与那个唯一的实现点。
 */
export const FRAME_DERIVATIONS = [
  /** terminal payload → ACP `StopReason` 的有损折叠（表在 `protocol/terminal-map.ts`） */
  "stop_reason",
  /** 脱敏后的 payload 原样带上，供目标面自行取用 */
  "raw_payload",
  /** CUSTOM 帧的名字，恒为 `trylo.<kind>`（禁止空 CUSTOM） */
  "custom_name",
  /** CUSTOM 帧的可重建载荷：坐标 + 脱敏 payload */
  "custom_envelope",
  /** 子代理帧的自身 id；血缘字段一律不发射 */
  "subagent_run_id",
  /** 截至当前 envelope 的聚合对象（ag-ui `STATE_SNAPSHOT`） */
  "state_snapshot",
  /** Trylo 终态原值，不做 ACP 折叠 */
  "run_outcome",
  /** session/turn → thread/run 的绑定（本包唯一的谱系绑定决定） */
  "lineage",
] as const;

export type FrameDerivation = (typeof FRAME_DERIVATIONS)[number];

export type FrameFieldSpec =
  /**
   * 从 payload 平移到帧体；源字段缺失时整条规格跳过（不填空、不补默认值）。
   * `onlyWhenFalse` 是一个**闭集守卫**：只有 `payload[onlyWhenFalse] === false`
   * 时才搬。它存在的唯一用途是「provider 未声明为未脱敏的推理内容不进帧」，
   * 把这条隐私策略写在表里，而不是写进投影器的 if。
   */
  | {
      readonly kind: "copy";
      readonly from: string;
      readonly as: string;
      readonly onlyWhenFalse?: string;
    }
  /** 常量字段，例如目标形状要求的 `status: "in_progress"`。 */
  | { readonly kind: "literal"; readonly as: string; readonly value: JsonValue }
  /** 文本块：`{ [as]: { type: "text", text: payload[from] } }`。守卫语义同 `copy`。 */
  | {
      readonly kind: "text_block";
      readonly from: string;
      readonly as: string;
      readonly onlyWhenFalse?: string;
    }
  /** 共享派生值。 */
  | { readonly kind: "derived"; readonly name: FrameDerivation; readonly as: string };

/** CUSTOM 帧名统一前缀。两个表面共用，避免两处各写一个前缀而漂移。 */
export const FRAME_CUSTOM_PREFIX = "trylo.";
