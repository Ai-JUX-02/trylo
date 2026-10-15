/** Explicit config overrides the declared provider window. Unknown remains off;
 * a known window permits automatic compaction without guessing model limits.
 */
export function effectiveContextCeiling(configured: number | undefined, declared: number | undefined): number | undefined {
  return configured ?? declared;
}
