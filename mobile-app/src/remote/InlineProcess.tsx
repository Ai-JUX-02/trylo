import { remoteText } from "./copy";
import { MarkdownMessage, type UiLanguage } from "../ui";
import type { RemoteChatMessage } from "../gateway";
import { Icon } from "./icons";
function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
/** The same authoritative message used by the compact view, rendered in place. */
export default function InlineProcess({
  message,
  open,
  onOpen,
  language,
}: {
  message: RemoteChatMessage;
  language: UiLanguage;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const t = (value: string) => remoteText(language, value);
  const thinking = message.role === "thinking";
  const status = message.status || "done";
  const label =
    status === "streaming"
      ? t("进行中")
      : status === "error"
        ? t("失败")
        : status === "interrupted"
          ? t("已中断")
          : t("已完成");
  const icon =
    status === "error"
      ? "close"
      : status === "interrupted"
        ? "stop"
        : status === "streaming"
          ? "clock"
          : "check";
  let target = "";
  try {
    const input = JSON.parse(message.input || "{}");
    target = String(input.path || input.file_path || input.command || "");
  } catch {
    /* Unstructured inputs are shown in the body. */
  }
  return (
    <details
      className={`rw-inline-event${thinking ? " is-thinking" : ""} state-${status}`}
      open={open}
      onToggle={(event) => onOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="rw-inline-kind">
          <Icon
            name={
              thinking
                ? "activity"
                : /command|bash|shell|检查/i.test(message.title || "")
                  ? "terminal"
                  : "file"
            }
            size={17}
          />
        </span>
        <span className="rw-inline-title">
          <strong>
            {message.title || (thinking ? t("思考摘要") : t("工具操作"))}
          </strong>
          {target && <small>{target}</small>}
        </span>
        <span className="rw-inline-status">
          {!thinking && <Icon name={icon} size={12} />}{" "}
          {thinking ? t("思考摘要") : label}
        </span>
        <Icon name="chevron" size={13} />
      </summary>
      <div className="rw-inline-body">
        {thinking ? (
          <MarkdownMessage
            text={message.text || t("电脑未提供思考摘要。")}
            language={language}
          />
        ) : (
          <>
            {message.input !== undefined && (
              <>
                <h3>{t("输入")}</h3>
                <pre>{pretty(message.input)}</pre>
              </>
            )}
            {message.output !== undefined && (
              <>
                <h3>{status === "error" ? t("错误") : t("结果")}</h3>
                <pre>{message.output || t("无文本输出")}</pre>
              </>
            )}
            {message.output === undefined && (
              <p>
                {message.text ||
                  (status === "streaming"
                    ? t("等待电脑返回结果。")
                    : t("电脑未提供文本结果。"))}
              </p>
            )}
            {message.durationMs != null && (
              <small>
                {t("耗时")}
                {(message.durationMs / 1000).toFixed(2)}
                {t("秒")}
              </small>
            )}
          </>
        )}
      </div>
    </details>
  );
}
