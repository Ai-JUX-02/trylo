import type { DirectAttachment } from "./directChat";
import type { RemoteChatMessage, RemoteSurface } from "./gateway";

/**
 * Read-only on-device cache for the REMOTE conversation.
 *
 * The computer stays the single authority: this cache is written whenever a
 * fresh snapshot / history arrives and is only ever READ when the gateway is
 * unreachable (offline展位). Nothing here is written back to the server, and
 * Code / Work surfaces share the same per-session slot because the Desktop
 * already keeps them as separate sessions server-side.
 *
 * Storage budget mirrors the direct-chat tradeoff: thumbnails stay, full
 * image bytes (`sendData`) and long text excerpts are dropped so a few
 * photos cannot blow the ~5MB localStorage quota.
 */

const CACHE_STORAGE_KEY = "trylo.remote.cache.v1";
const MAX_SESSIONS = 10;
const MAX_MESSAGES_PER_SESSION = 60;
const MAX_MESSAGE_CHARS = 24_000;
const MAX_ATTACHMENT_TEXT_CHARS = 400;

export interface CachedRemoteConversation {
  sessionId: string;
  deviceId?: string;
  workspace: string;
  messages: RemoteChatMessage[];
  at: number;
  projectId?: string;
  surface?: RemoteSurface;
  title?: string;
}

type RemoteCacheFile = Record<string, CachedRemoteConversation>;

function stripAttachment(attachment: DirectAttachment): DirectAttachment {
  const { sendData: _sendData, ...rest } = attachment;
  if (
    rest.kind === "text" &&
    rest.text &&
    rest.text.length > MAX_ATTACHMENT_TEXT_CHARS
  ) {
    return {
      ...rest,
      text: `${rest.text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}…`,
    };
  }
  return rest;
}

function sanitizeMessage(message: RemoteChatMessage): RemoteChatMessage | null {
  if (
    message.role !== "user" &&
    message.role !== "assistant" &&
    message.role !== "thinking" &&
    message.role !== "tool"
  )
    return null;
  const text = String(message.text || "").slice(0, MAX_MESSAGE_CHARS);
  const attachments = message.attachments?.length
    ? message.attachments.slice(0, 6).map(stripAttachment)
    : undefined;
  if (!text && !attachments && message.role !== "tool") return null;
  return {
    id: String(message.id || "").slice(0, 200),
    role: message.role,
    ...(message.title ? { title: String(message.title).slice(0, 120) } : {}),
    text,
    at:
      typeof message.at === "number" || typeof message.at === "string"
        ? message.at
        : Date.now(),
    ...(message.status ? { status: message.status } : {}),
    ...(message.mode ? { mode: message.mode } : {}),
    ...(message.turnId ? { turnId: String(message.turnId).slice(0, 200) } : {}),
    ...(message.toolCallId
      ? { toolCallId: String(message.toolCallId).slice(0, 200) }
      : {}),
    ...(message.input !== undefined
      ? {
          input:
            message.input.length > 2000
              ? `${message.input.slice(0, 2000)}\n…`
              : message.input,
        }
      : {}),
    ...(message.output !== undefined
      ? {
          output:
            message.output.length > 2000
              ? `${message.output.slice(0, 2000)}\n…`
              : message.output,
        }
      : {}),
    ...(message.durationMs !== undefined
      ? { durationMs: message.durationMs }
      : {}),
    ...(attachments ? { attachments } : {}),
  };
}

export function loadRemoteCache(): RemoteCacheFile {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CACHE_STORAGE_KEY) || "{}",
    ) as RemoteCacheFile;
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.values(parsed).filter(
      (entry): entry is CachedRemoteConversation =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.sessionId === "string",
    );
    entries.sort((a, b) => b.at - a.at);
    return Object.fromEntries(
      entries
        .slice(0, MAX_SESSIONS)
        .map((entry) => [
          `${entry.deviceId || "legacy"}:${entry.sessionId}`,
          entry,
        ]),
    );
  } catch {
    return {};
  }
}

function persistCache(cache: RemoteCacheFile) {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage may be full; the live snapshot stays authoritative regardless.
  }
}

/** Record the latest server-authoritative conversation for one session. */
export function saveRemoteConversation(
  sessionId: string,
  workspace: string,
  messages: RemoteChatMessage[],
  deviceId?: string,
  context: { projectId?: string; surface?: RemoteSurface; title?: string } = {},
) {
  if (!sessionId) return;
  const clean = messages
    .slice(-MAX_MESSAGES_PER_SESSION)
    .map(sanitizeMessage)
    .filter((message): message is RemoteChatMessage => Boolean(message));
  const cache = loadRemoteCache();
  cache[`${deviceId || "legacy"}:${sessionId}`] = {
    sessionId,
    deviceId,
    workspace: String(workspace || ""),
    messages: clean,
    at: Date.now(),
    ...context,
  };
  const entries = Object.values(cache)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_SESSIONS);
  persistCache(
    Object.fromEntries(
      entries.map((entry) => [
        `${entry.deviceId || "legacy"}:${entry.sessionId}`,
        entry,
      ]),
    ),
  );
}

/** Newest cached conversation across sessions (for the offline展位). */
export function readLatestCachedConversation(
  deviceId?: string,
): CachedRemoteConversation | null {
  const entries = Object.values(loadRemoteCache())
    .filter((entry) => !!deviceId && entry.deviceId === deviceId)
    .sort((a, b) => b.at - a.at);
  return entries[0] || null;
}
