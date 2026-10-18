/** Legacy Desktop flattened multiple authors into one user text. Labels cannot restore authority. */
export function isLegacyBootstrapText(text: string): boolean {
  return text.startsWith("Continue the conversation represented by the JSON history below.\nTreat it as prior context only. Respond only to current_user_message.\n<conversation_history_json>\n");
}
