import { sha256Hex } from "./hash.js";
import { privacyStamp, type PrivacyStamp } from "./types.js";

export function hashUserText(text: string): string {
  return `uh_${sha256Hex(text)}`;
}

export function observationPrivacy(pointer: string): PrivacyStamp {
  return privacyStamp(
    [
      "id",
      "conversationId",
      "taskFamily",
      "promptHash",
      "versions",
      "external.ref",
      "textHash",
    ],
    pointer,
  );
}
