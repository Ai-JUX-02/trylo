// Prune an existing Work daemon artifact into a NEW tree. Never edits the input.
// Runtime JS, package manifests, native bindings, fonts and legal notices survive.
// This is a packaging pass, not proof of Control Plane/task acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  assert.ok(['--source', '--output', '--report'].includes(process.argv[i]), 'Unknown option');
  assert.ok(process.argv[i + 1], 'Missing option value');
  flags.set(process.argv[i], path.resolve(process.argv[i + 1]));
}
const source = await fs.realpath(flags.get('--source') ?? path.join(root, 'desktop/src-tauri/resources/workd'));
const output = flags.get('--output') ?? path.join(root, 'desktop/src-tauri/resources/workd-slim');
assert.ok(!existsSync(output), 'Refusing to overwrite an existing candidate');
const relative = path.relative(source, output);
assert.ok(relative && (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)), 'Output must be outside the input tree');
const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
assert.equal(manifest.kind, 'trylo-workd-sidecar');
assert.equal(manifest.daemonMain, 'dist/daemon/daemon/main.js');
const files = new Map();
async function walk(dir, prefix = '') {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name;
    assert.ok(!item.isSymbolicLink(), 'Redirected artifact file: ' + name);
    if (item.isDirectory()) await walk(path.join(dir, item.name), name + '/');
    else if (item.isFile()) files.set(name, 0);
    else assert.fail('Unsupported artifact entry: ' + name);
  }
}
await walk(source);
console.log(`Work packaging inventory: ${files.size} files`);
const inventory = [...files.keys()]; let statNext = 0;
await Promise.all(Array.from({length: 16}, async () => {
  while (statNext < inventory.length) {
    const name = inventory[statNext++];
    files.set(name, (await fs.stat(path.join(source, name))).size);
  }
}));
const developmentDirs = new Set(['test', 'tests', '__tests__', 'doc', 'docs', 'demo', 'demos', 'example', 'examples', 'benchmark', 'benchmarks', '.github', 'coverage']);
function removable(name) {
  const parts = name.split('/');
  // Preserve notices even if a package stores them under a documentation folder.
  if (/^(?:licen[cs]e|copying|copyright|notice|third[-_]?party|readme)/i.test(parts.at(-1))) return null;
  if (name.endsWith('.map')) return 'sourceMaps';
  // TypeScript's compiler can read its standard library declarations at runtime.
  if (/\.d\.[cm]?ts$/.test(name) && !/node_modules\/typescript\/lib\//.test(name)) return 'typeDeclarations';
  const boundary = parts.lastIndexOf('node_modules');
  const contentStart = boundary + 1 + (parts[boundary + 1]?.startsWith('@') ? 2 : 1);
  // Only package-root development folders. `exceljs/lib/doc` is runtime code.
  if (boundary >= 0 && developmentDirs.has(parts[contentStart])) return 'developmentFiles';
  if (name.endsWith('.pdb')) return 'debugSymbols';
  return null;
}
const removed = new Map([...files.keys()].flatMap(name => {
  const reason = removable(name); return reason ? [[name, reason]] : [];
}));
const keep = new Set([...files.keys()].filter(name => !removed.has(name)));
const protectedReferences = [];
const queue = [...keep].filter(name => /\.[cm]?js$/.test(name));
const cache = new Map();
// Conservative static-resolution guard: if surviving code can resolve a literal
// import/require into a removed subtree, restore that target and inspect it too.
// Unresolved optional/platform imports already absent from the input are unchanged.
for (let cursor = 0; cursor < queue.length; cursor++) {
  const name = queue[cursor];
  const code = await fs.readFile(path.join(source, name), 'utf8');
  const require = createRequire(path.join(source, name));
  const refs = /\b(?:require(?:\.resolve)?|import)\s*\(\s*['"]([^'"]+)['"]|\bfrom\s+['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(refs)) {
    const spec = match[1] ?? match[2];
    if (isBuiltin(spec)) continue;
    // Bare package imports share a resolution context within the same package.
    const packageBoundary = name.lastIndexOf('/node_modules/');
    const packageStart = packageBoundary >= 0 ? packageBoundary + 1 : name.startsWith('node_modules/') ? 0 : -1;
    const rest = name.slice(packageStart + 'node_modules/'.length).split('/');
    const packageContext = packageStart >= 0 && name.includes('node_modules/')
      ? name.slice(0, packageStart) + 'node_modules/' + rest.slice(0, rest[0].startsWith('@') ? 2 : 1).join('/')
      : 'dist/daemon';
    const key = (spec.startsWith('.') ? path.posix.dirname(name) : packageContext) + '\0' + spec;
    let resolved = cache.get(key);
    if (resolved === undefined) {
      try { resolved = require.resolve(spec); } catch { resolved = null; }
      cache.set(key, resolved);
    }
    if (!resolved) continue;
    const target = path.relative(source, resolved).split(path.sep).join('/');
    if (!removed.has(target)) continue;
    removed.delete(target); keep.add(target);
    protectedReferences.push({ from: name, specifier: spec, target });
    if (/\.[cm]?js$/.test(target)) queue.push(target);
  }
  if (cursor % 1000 === 0) console.log(`Work packaging guard: ${cursor}/${queue.length} JavaScript files`);
}
const directories = new Set([...keep].map(name => path.dirname(path.join(output, name))));
for (const dir of directories) await fs.mkdir(dir, { recursive: true });
const names = [...keep].sort();
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < names.length) {
    const name = names[next++];
    await fs.copyFile(path.join(source, name), path.join(output, name));
  }
}));
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const nativeBindings = names.filter(name => name.endsWith('.node'));
for (const name of nativeBindings) assert.equal(digest(path.join(output, name)), digest(path.join(source, name)));
const categories = {};
for (const [name, reason] of removed) {
  categories[reason] ??= { files: 0, bytes: 0 };
  categories[reason].files++; categories[reason].bytes += files.get(name);
}
const report = {
  kind: 'trylo-workd-packaging-prune', sourceManifestSha256: digest(path.join(source, 'manifest.json')),
  daemonSha256: digest(path.join(output, manifest.daemonMain)),
  before: { files: files.size, bytes: [...files.values()].reduce((a, b) => a + b, 0) },
  after: { files: keep.size, bytes: names.reduce((sum, name) => sum + files.get(name), 0) },
  removed: categories, protectedLiteralReferences: protectedReferences,
  nativeBindingsUnchanged: nativeBindings.length,
  controlPlaneAcceptance: 'not established by packaging checks',
};
assert.equal(report.daemonSha256, digest(path.join(source, manifest.daemonMain)));
await fs.writeFile(path.join(output, 'slimming-report.json'), JSON.stringify(report, null, 2) + '\n');
if (flags.has('--report')) await fs.writeFile(flags.get('--report'), JSON.stringify({ ...report, removedFiles: [...removed.keys()] }, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
