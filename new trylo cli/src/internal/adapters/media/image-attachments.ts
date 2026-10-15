import type { ImageDetail, ProviderImageAttachment } from "../../ports/media.js";

/**
 * Provider wire serialization for image attachments (WP19.1: C25, C26).
 *
 * Pure translators: canonical attachment in, wire-shaped JSON out. No fetch,
 * no credentials, no logging of the payload. Both functions are identity when
 * there is nothing attached, so a text-only request serializes byte for byte
 * as before this module existed.
 */

export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string; readonly detail: ImageDetail } };

export function chatContentOf(
  content: string,
  attachments: ReadonlyArray<ProviderImageAttachment> | undefined,
): string | ReadonlyArray<ChatContentPart> {
  if (attachments === undefined || attachments.length === 0) {
    return content;
  }
  return [
    { type: "text", text: content },
    ...attachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${attachment.mediaType};base64,${attachment.dataBase64}`,
        detail: attachment.detail,
      },
    })),
  ];
}

export type ResponsesContentPart =
  | { readonly type: "input_text"; readonly text: string }
  | { readonly type: "input_image"; readonly image_url: string; readonly detail: ImageDetail };

export function responsesContentOf(
  content: string,
  attachments: ReadonlyArray<ProviderImageAttachment> | undefined,
): string | ReadonlyArray<ResponsesContentPart> {
  if (attachments === undefined || attachments.length === 0) {
    return content;
  }
  return [
    { type: "input_text", text: content },
    ...attachments.map((attachment) => ({
      type: "input_image" as const,
      image_url: `data:${attachment.mediaType};base64,${attachment.dataBase64}`,
      detail: attachment.detail,
    })),
  ];
}
