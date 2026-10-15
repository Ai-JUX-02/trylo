/**
 * The effect key vocabulary, defined once.
 *
 * The reducer builds a key when it decides an effect exists; a reader (the
 * reconcile command) has to read one back to say *which* action it names.
 * Both must agree, so the format lives here rather than being written as a
 * literal at each site.
 */

export const EFFECT_KEY_PREFIXES = {
  /** An approved tool call that crossed the execution boundary. */
  tool: "tool",
  /** A permission question asked of the person driving the turn. */
  permission: "perm",
  providerCancel: "cancel-provider",
  toolCancel: "cancel-tool",
} as const;

export function toolEffectKey(toolCallId: string): string {
  return `${EFFECT_KEY_PREFIXES.tool}:${toolCallId}`;
}

/**
 * The tool call an effect key names, when it names one.
 *
 * Returns `undefined` for every other key family rather than guessing: a
 * `perm:` or `cancel-tool:` key is not a call identity, and slicing it at the
 * colon would produce a plausible-looking wrong id.
 */
export function toolCallIdOfEffectKey(key: string): string | undefined {
  const [prefix, ...rest] = key.split(":");
  if (prefix !== EFFECT_KEY_PREFIXES.tool || rest.length === 0) {
    return undefined;
  }
  return rest.join(":");
}
