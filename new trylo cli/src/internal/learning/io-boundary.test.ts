import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The learning layer's IO boundary (WP-F OPEN-5).
 *
 * Learning reads episodes and writes proposals. It must never *reach* anything:
 * no socket, no filesystem, no child process, no provider SDK, and above all no
 * permission machinery. Every effect it needs arrives through a port someone
 * else owns, so that a learned proposal can be refused by the permission gate
 * instead of having already happened.
 *
 * Two detectors, because the two failure modes are different:
 *
 *  - **Import specifiers.** A layer segment (`adapters`, `loop`, `desktop`,
 *    `permission`, `surface`) or an IO builtin (`node:fs`, `node:http`,
 *    `node:child_process`, …) in a `from`/`import()` clause.
 *  - **Network globals.** `fetch` and `WebSocket` need no import at all on
 *    modern Node, so an import-only scan would report a clean layer that can
 *    still talk to the internet. This is the hole the negative fixture exists
 *    to prove closed.
 *
 * Both are run over the two fixtures in `testdata/architecture/` first: a
 * boundary test that cannot fail is worse than no test, because it is trusted.
 *
 * The scanner is deliberately a second copy of the one in `loop/boundary.test.ts`
 * rather than a shared helper: this pack's write set does not include a common
 * module both tests could import, and a wrong shared abstraction across two
 * boundaries (loop forbids `learning`; learning forbids `loop`) is worse than
 * fifteen duplicated lines. Extracting one detector is registered as a
 * follow-up in `Q-HANDOFF-MANIFEST.md`.
 */

const hereDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(hereDir, "..", "..", "..");
const learningRoot = join(repoRoot, "src", "internal", "learning");
const fixtureDir = join(repoRoot, "testdata", "architecture");

/** Layers whose behaviour is somebody else's to own. */
const FORBIDDEN_LAYERS = new Set(["adapters", "loop", "desktop", "permission", "surface"]);

/** Builtins that would make learning an IO performer rather than a proposer. */
const FORBIDDEN_BUILTINS = new Set([
  "node:fs",
  "node:fs/promises",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:child_process",
]);

/** Provider SDKs: a model call from inside learning is an unapproved effect. */
const FORBIDDEN_PACKAGES = ["openai", "@anthropic-ai/sdk", "undici", "axios", "node-fetch"];

/** Network reachable without any import statement at all. */
const NETWORK_GLOBAL_PATTERNS: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp }> = [
  { name: "fetch", pattern: /\bfetch\s*\(/ },
  { name: "WebSocket", pattern: /\bnew\s+WebSocket\b/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
];

const specifierPattern = /(?:from\s+|import\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

type ForbiddenHit = { readonly specifier: string; readonly layer: string };

function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(specifierPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function forbiddenImportsIn(source: string): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  for (const specifier of importedSpecifiers(source)) {
    const segments = specifier.replaceAll("\\", "/").split("/");
    for (const layer of segments) {
      if (FORBIDDEN_LAYERS.has(layer)) {
        hits.push({ specifier, layer });
      }
    }
    if (FORBIDDEN_BUILTINS.has(specifier)) {
      hits.push({ specifier, layer: specifier });
    }
    for (const pkg of FORBIDDEN_PACKAGES) {
      if (specifier === pkg || specifier.startsWith(`${pkg}/`)) {
        hits.push({ specifier, layer: pkg });
      }
    }
  }
  return hits;
}

function networkGlobalsIn(source: string): string[] {
  return NETWORK_GLOBAL_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

async function productionTsFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const pending: string[] = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".ts") && !fullPath.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

test("the detector fails closed on a learning file that reaches the network", async () => {
  const source = await readFile(join(fixtureDir, "forbidden-learning-import-network.ts"), "utf8");
  const hits = forbiddenImportsIn(source);
  assert.equal(
    hits.some((hit) => hit.specifier === "node:http"),
    true,
    "node:http must be caught by the builtin rule",
  );
  assert.equal(
    hits.some((hit) => hit.layer === "openai"),
    true,
    "the openai SDK must be caught by the package rule",
  );
  // The part no import scan can see: these need no import at all.
  assert.deepEqual(networkGlobalsIn(source).sort(), ["WebSocket", "fetch"]);
});

test("the detector fails closed on a learning file that imports permission, adapters, loop or UI", async () => {
  const source = await readFile(join(fixtureDir, "forbidden-learning-import-permission.ts"), "utf8");
  const hits = forbiddenImportsIn(source);
  for (const layer of ["permission", "adapters", "loop", "desktop"]) {
    assert.equal(
      hits.some((hit) => hit.layer === layer),
      true,
      `testdata/architecture/forbidden-learning-import-permission.ts must catch ${layer}`,
    );
  }
});

test("the learning layer imports no IO builtin, provider SDK or foreign layer", async () => {
  const files = await productionTsFiles(learningRoot);
  // A boundary test that scanned nothing would pass for the wrong reason.
  assert.equal(files.length > 0, true, `${relative(repoRoot, learningRoot)} must contain production files`);

  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const hit of forbiddenImportsIn(source)) {
      violations.push(`${relative(repoRoot, file)} imports ${hit.layer} via ${hit.specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("the learning layer reaches no network global", async () => {
  const files = await productionTsFiles(learningRoot);
  assert.equal(files.length > 0, true);

  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const name of networkGlobalsIn(source)) {
      violations.push(`${relative(repoRoot, file)} uses the network global ${name}`);
    }
  }
  assert.deepEqual(violations, []);
});
