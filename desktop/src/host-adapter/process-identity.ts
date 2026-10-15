/** A timestamp is not unique when two conversations spawn in the same tick. */
export function localProcessIdentity(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const identity = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${identity}`;
}
