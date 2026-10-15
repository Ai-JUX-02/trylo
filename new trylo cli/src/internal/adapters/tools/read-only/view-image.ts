import type { JsonObject } from "../../../protocol/envelope.js";
import type { ToolCallRequest, ToolOutcome } from "../../../ports/tools.js";
import {
  checkImageBytes,
  checkImageDetail,
  describeImageForLog,
} from "../../media/image-guard.js";
import { readStringArg } from "./args.js";
import type { FileSystemReader } from "./limits.js";
import { resolveInsideWorkspace } from "./workspace.js";

export const VIEW_IMAGE_TOOL = "view_image";

export type ViewImageConfig = {
  readonly workspaceRoot: string;
  readonly reader: FileSystemReader;
};

/**
 * Local image viewing as a read-only tool (WP19.1: C25, L10).
 *
 * Reuse: Codex `ViewImageHandler` (path resolution against the turn
 * environment, model-capability and detail gating, invalid-image rejection
 * before bytes travel further) and the legacy `FileReadTool` image branch
 * (MIME allowlist, size budget, dimension metadata). The Trylo shape differs
 * in one deliberate place: the text `output` the model reads now carries only
 * the redacted summary, while the full data URL travels in the structured
 * `value` for the request layer to attach to the wire. Stuffing megabytes of
 * base64 into the replayed transcript would tax every later turn for a fact
 * the wire needs exactly once.
 */
export async function executeViewImage(
  config: ViewImageConfig,
  call: ToolCallRequest,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  const requested = readStringArg(call.arguments, "path");
  if (requested === undefined) {
    return { outcome: "error", code: "invalid_arguments", message: "view_image requires path" };
  }
  // Rejected before the file is touched: a bad `detail` must not cost a read,
  // the same rule `read_file` applies to a bad `offset`.
  const detail = checkImageDetail(readStringArg(call.arguments, "detail"));
  if (!detail.ok) {
    return { outcome: "error", code: "invalid_arguments", message: `view_image: ${detail.message}` };
  }
  if (signal.aborted) {
    return { outcome: "cancelled" };
  }
  const verdict = resolveInsideWorkspace(config.workspaceRoot, requested);
  if (!verdict.ok) {
    return { outcome: "error", code: verdict.code, message: verdict.code };
  }
  const readBytes = config.reader.readFileBytes;
  if (readBytes === undefined) {
    return {
      outcome: "error",
      code: "bytes_unavailable",
      message: "bytes_unavailable: this filesystem reader serves text only",
    };
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(verdict.absolutePath, signal);
  } catch (error) {
    if (signal.aborted) {
      return { outcome: "cancelled" };
    }
    const detailMessage = error instanceof Error ? error.message : "read_error";
    return { outcome: "error", code: "read_failed", message: `read_failed:${detailMessage}` };
  }
  if (signal.aborted) {
    return { outcome: "cancelled" };
  }
  const validation = checkImageBytes({ bytes, path: requested });
  if (!validation.ok) {
    return { outcome: "error", code: validation.code, message: validation.message };
  }
  const attachment = { ...validation.attachment, detail: detail.detail };
  const summary = describeImageForLog(attachment);
  const value: JsonObject = {
    path: requested,
    mediaType: attachment.mediaType,
    bytes: attachment.bytes,
    detail: attachment.detail,
    ...(attachment.width === undefined ? {} : { width: attachment.width }),
    ...(attachment.height === undefined ? {} : { height: attachment.height }),
    dataUrl: `data:${attachment.mediaType};base64,${attachment.dataBase64}`,
  };
  return {
    outcome: "result",
    value,
    output: `${summary} path=${JSON.stringify(requested)}`,
    truncated: false,
  };
}
