/**
 * The four verdicts a diagnostic can reach.
 *
 * Its own module because two files need it and one of them must not import the
 * other: `doctor.ts` collects checks and renders them, while
 * `project-rules-check.ts` builds one check and is imported *by* `doctor.ts`.
 * A status type shared across that edge belongs to neither side, so it lives
 * here — a two-line module is a smaller cost than an import cycle.
 */
export type CheckStatus = "ok" | "warn" | "fail" | "skip";
