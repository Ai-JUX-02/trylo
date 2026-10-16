// Trylo Desktop Services — pet chat history store.
//
// Ported from the legacy extension's readDesktopChatMessages /
// writeDesktopChatMessages (extension.js ~6712-6760) per migration spec
// §6.4. File shape `{ version: 1, savedAt, messages }` and the sanitize
// semantics are unchanged; the location moves to the Desktop app-data root
// the Tauri shell injects via TRYLO_APP_DATA_DIR. The legacy per-workspace
// sha1 file split is dropped on purpose: the service host serves exactly
// one workspace per process (deviation recorded in the migration PR).

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { sanitizeDesktopChatMessages } from './chat-limits.mjs';

/** `<appDataDir>/Trylo/companion/desktop-chat.json`; '' when no root. */
export function desktopChatStorageFilePath(appDataDir) {
  const root = String(appDataDir || '').trim();
  if (!root) return '';
  return path.join(root, 'Trylo', 'companion', 'desktop-chat.json');
}

export function createChatStore(appDataDir) {
  const filePath = desktopChatStorageFilePath(appDataDir);
  let queue = Promise.resolve();

  return {
    get filePath() {
      return filePath;
    },

    /** Sanitized history ([] when the file is missing/corrupt — legacy
     *  semantics: a broken file never fails a chat turn). */
    async read() {
      if (!filePath) return [];
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return sanitizeDesktopChatMessages(parsed && parsed.messages);
      } catch {
        return [];
      }
    },

    /** Sanitizes, then atomically publishes JSON in call order. Returns whether a
     *  write actually happened (false when no app-data root is set). */
    async write(messages) {
      if (!filePath) return false;
      const sanitized = sanitizeDesktopChatMessages(messages);
      const operation = queue.then(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(tmp, JSON.stringify({ version: 1, savedAt: Date.now(), messages: sanitized }, null, 2), 'utf8');
          await fs.rename(tmp, filePath);
        } finally {
          // Preserve the write failure if best-effort temp cleanup also fails.
          await fs.rm(tmp, { force: true }).catch(() => {});
        }
        return true;
      });
      queue = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
}
