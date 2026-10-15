/**
 * Glob compilation for `glob_files`: one pure function from a pattern string to
 * a matcher over forward-slash relative paths. No I/O, no state, no dependency.
 *
 * Supported syntax, deliberately the subset models already know from gitignore
 * and shell globs:
 *
 *  - `*`        any run of characters inside one path segment
 *  - `**`       any run of segments; when followed by a slash it means
 *               zero or more leading directories
 *  - `?`        exactly one character inside one segment
 *  - `{a,b}`    alternation, nestable; an unbalanced brace is a compile error
 *  - `[a-z]`    character class, `[!abc]` negation; empty or unterminated is
 *               a compile error
 *  - `\x`       literal `x`; a trailing backslash is a compile error
 *
 * A pattern with no unescaped `/` matches the *basename* at any depth — the
 * gitignore convention — so `*.ts` finds `src/deep/b.ts` without the caller
 * having to know the tree shape. A pattern containing `/` is anchored to the
 * whole relative path instead.
 */

export type GlobMatcher = {
  /** True when the pattern has no slash and therefore matches basenames. */
  readonly basenameOnly: boolean;
  matches(relativePath: string): boolean;
};

export type GlobCompileResult =
  | { readonly ok: true; readonly matcher: GlobMatcher }
  | { readonly ok: false; readonly code: "invalid_pattern"; readonly message: string };

class GlobSyntaxError extends Error {}

function escapeLiteral(char: string): string {
  return /[a-zA-Z0-9_]/.test(char) ? char : `\\${char}`;
}

/** Finds the `}` matching the `{` at `open`, honoring nesting. -1 when absent. */
function matchingBrace(pattern: string, open: number): number {
  let depth = 0;
  for (let i = open; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Splits `{a,b}` body on top-level commas only. */
function splitAlternatives(body: string): Array<string> {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "\\") {
      current += char + (body[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** Finds the `]` closing the class opened at `open`. -1 when unterminated. */
function matchingBracket(pattern: string, open: number): number {
  for (let i = open + 1; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "]") {
      return i;
    }
  }
  return -1;
}

function compileClassBody(body: string): string {
  // `[!...]` is the glob spelling of the regex negation `[^...]`.
  const negated = body.startsWith("!") || body.startsWith("^");
  const rest = negated ? body.slice(1) : body;
  if (rest.length === 0) {
    throw new GlobSyntaxError("empty character class");
  }
  // Inside a class only `\`, `]` and `[` need care; ranges pass through, and a
  // backslash escape keeps its regex meaning.
  const escaped = rest.replace(/[[\]]/g, "\\$&");
  return `[${negated ? "^" : ""}${escaped}]`;
}

/** Translates one pattern (or alternation branch) into regex source. */
function toRegExpSource(pattern: string): string {
  let source = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i] as string;
    if (char === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) {
        throw new GlobSyntaxError("pattern ends with a backslash");
      }
      source += escapeLiteral(next);
      i += 2;
      continue;
    }
    if (char === "{") {
      const close = matchingBrace(pattern, i);
      if (close === -1) {
        throw new GlobSyntaxError("unbalanced '{'");
      }
      const alternatives = splitAlternatives(pattern.slice(i + 1, close));
      if (alternatives.length < 2) {
        throw new GlobSyntaxError("'{...}' needs at least one comma");
      }
      const branches = alternatives.map((part) => toRegExpSource(part));
      source += `(?:${branches.join("|")})`;
      i = close + 1;
      continue;
    }
    if (char === "}") {
      throw new GlobSyntaxError("unbalanced '}'");
    }
    if (char === "[") {
      const close = matchingBracket(pattern, i);
      if (close === -1) {
        throw new GlobSyntaxError("unterminated character class");
      }
      source += compileClassBody(pattern.slice(i + 1, close));
      i = close + 1;
      continue;
    }
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // Consume the whole `**` run, then decide by what follows.
        let end = i;
        while (pattern[end] === "*") {
          end += 1;
        }
        if (pattern[end] === "/") {
          // `**/` is zero or more leading directories.
          source += "(?:.*/)?";
          i = end + 1;
        } else {
          // Trailing or mid-segment `**` spans everything.
          source += ".*";
          i = end;
        }
        continue;
      }
      source += "[^/]*";
      i += 1;
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      i += 1;
      continue;
    }
    source += escapeLiteral(char);
    i += 1;
  }
  return source;
}

function hasUnescapedSlash(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === "\\") {
      i += 1;
      continue;
    }
    if (pattern[i] === "/") {
      return true;
    }
  }
  return false;
}

export function compileGlob(pattern: string): GlobCompileResult {
  let source: string;
  try {
    source = toRegExpSource(pattern);
  } catch (err) {
    const reason = err instanceof GlobSyntaxError ? err.message : "invalid pattern";
    return { ok: false, code: "invalid_pattern", message: `invalid_pattern:${reason}` };
  }
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${source})$`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "invalid pattern";
    return { ok: false, code: "invalid_pattern", message: `invalid_pattern:${reason}` };
  }
  const basenameOnly = !hasUnescapedSlash(pattern);
  return {
    ok: true,
    matcher: {
      basenameOnly,
      matches(relativePath: string): boolean {
        const target = basenameOnly
          ? relativePath.slice(relativePath.lastIndexOf("/") + 1)
          : relativePath;
        return regex.test(target);
      },
    },
  };
}
