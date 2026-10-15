/**
 * One Desktop summary policy for both CLI transports. Preserve the legacy
 * Desktop behavior: prefer an action phrase, then the first sentence, then
 * normalized prose. Summaries are not truncated; preview retains the body.
 * Empty input leaves ThinkingCard to choose its placeholder.
 */
const VERB_HINTS: RegExp[] = [
  /^The\s+user\s+wants\s+me\s+to\s+(.+?)(?:\.|$|\s+to\s+|\s+and\s+|\s+then\s+)/i,
  /^I'?ll\s+(.+?)(?:\.|$|\s+to\s+|\s+and\s+|\s+then\s+)/i,
  /^I\s+(?:will|am\s+going\s+to|need\s+to|should|want\s+to|must|have\s+to|can)\s+(.+?)(?:\.|$|\s+to\s+|\s+and\s+|\s+then\s+)/i,
  /^Let\s+me\s+(.+?)(?:\.|$|\s+to\s+|\s+and\s+|\s+then\s+)/i,
  /^I'?m\s+going\s+to\s+(.+?)(?:\.|$|\s+to\s+|\s+and\s+|\s+then\s+)/i,
  /^First,?\s+(?:I\s+)?(?:will\s+|want\s+to\s+|need\s+to\s+|should\s+)?(.+?)(?:\.|$)/i,
  /^Next,?\s+(?:I\s+)?(?:will\s+|want\s+to\s+|need\s+to\s+|should\s+)?(.+?)(?:\.|$)/i,
  /^Now\s+(?:I\s+)?(?:will\s+|want\s+to\s+|need\s+to\s+|should\s+)?(.+?)(?:\.|$)/i,
  /^Then\s+(?:I\s+)?(?:will\s+|want\s+to\s+|need\s+to\s+|should\s+)?(.+?)(?:\.|$)/i,
  /^I\s+should\s+probably\s+(.+?)(?:\.|$)/i,
  /^Looking\s+(?:at|for|into)\s+(.+?)(?:\.|$)/i,
  /^Checking\s+(.+?)(?:\.|$)/i,
  /^Reading\s+(.+?)(?:\.|$)/i,
  /^Writing\s+(.+?)(?:\.|$)/i,
  /^Searching\s+(.+?)(?:\.|$)/i,
  /^Running\s+(.+?)(?:\.|$)/i,
  /^Creating\s+(.+?)(?:\.|$)/i,
  /^Updating\s+(.+?)(?:\.|$)/i,
  /^Deleting\s+(.+?)(?:\.|$)/i,
];

export function thinkingSummary(text: string): string {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim();

  // Strategy A: pattern match the first action phrase.
  for (const re of VERB_HINTS) {
    const m = trimmed.match(re);
    if (m && m[1]) {
      let s = m[1]!.trim();
      // Strip trailing prepositions / articles for cleaner display
      s = s.replace(/\s+(a|an|the|to|with|for|on|at|in)$/i, '');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  // The Desktop consumer expects the complete summary, including long prose.
  const sentenceMatch = trimmed.match(/^[^.!?\n]+[.!?]/);
  if (sentenceMatch) {
    return sentenceMatch[0]!.trim();
  }

  // Strategy C: all words. NO "..." suffix.
  return trimmed.split(/\s+/).join(' ');
}
