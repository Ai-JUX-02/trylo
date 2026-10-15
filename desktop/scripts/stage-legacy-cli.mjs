import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(desktop);
const source = path.resolve(process.env.TRYLO_LEGACY_CLI_DIR || path.join(root, 'trylo cli'));
const resources = path.join(desktop, 'src-tauri/resources');
const target = path.join(resources, 'cli-legacy');
const node = path.join(resources, 'runtime/node/win-x64/node.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.ok(existsSync(node), 'Stage Node before the legacy CLI');
assert.ok(existsSync(path.join(source, 'cli.js')), 'Set TRYLO_LEGACY_CLI_DIR to the instrumented Trylo CLI build (not runtime/cli.js)');
const manifest = JSON.parse(readFileSync(path.join(source, 'package.json')));
assert.equal(manifest.name, 'trylo-cli');
assert.equal(manifest.version, '2.1.88-trylo');
const lock = JSON.parse(readFileSync(path.join(source, 'package-lock.json')));
assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
const staged = mkdtempSync(path.join(resources, 'cli-legacy-stage-'));
const packages = [];
try {
  // Do not distribute the development inline source map.
  const input = readFileSync(path.join(source, 'cli.js'), 'utf8');
  let redactedEmbeddedCredentials = 0;
  const executable = input.replace(/^[ \t]*\/\/[#@] sourceMappingURL=.*$/gm, '')
    .replace(/(apiKey:\s*["'])(?:sk-[A-Za-z0-9_-]{32,}|ark-[A-Za-z0-9_-]{24,})(["'])/g,
      (_match, before, after) => { redactedEmbeddedCredentials += 1; return before + after; });
  assert.ok(!/(?:sk-[A-Za-z0-9_-]{32,}|ark-[A-Za-z0-9_-]{24,})/.test(executable),
    'Unreviewed embedded credential remains in legacy executable');
  writeFileSync(path.join(staged, 'cli.cjs'), executable);
  writeFileSync(path.join(staged, 'package.json'), JSON.stringify({
    name: 'trylo-legacy-runtime', version: manifest.version, private: true, type: 'commonjs',
  }, null, 2) + '\n');
  for (const [location, locked] of Object.entries(lock.packages)) {
    if (!location.startsWith('node_modules/') || locked.dev === true) continue;
    const directory = path.resolve(source, location);
    assert.ok(directory.startsWith(path.join(source, 'node_modules') + path.sep));
    if (!existsSync(path.join(directory, 'package.json'))) {
      assert.ok(locked.optional === true, 'Missing required runtime package: ' + location);
      continue;
    }
    const installed = JSON.parse(readFileSync(path.join(directory, 'package.json')));
    const compatibilityPatch = location === 'node_modules/@alcalzone/ansi-tokenize'
      && installed.version === '0.3.0-stub' && locked.version === '0.3.0';
    if (compatibilityPatch) {
      // The legacy setup-runtime.mjs documents this CJS compatibility shim.
      const shim = readFileSync(path.join(directory, 'stub.js'), 'utf8');
      assert.equal(hash(shim), '1545b7a98f3935fb07bdc9b1be4b2a2fa271ba8819591d311364c82ed9e6ec24');
    } else assert.equal(installed.version, locked.version, 'Lock drift: ' + location);
    cpSync(directory, path.join(staged, location), { recursive: true, dereference: true,
      filter: p => !['.cache', '.vite', '.git', '.bin'].includes(path.basename(p)) });
    packages.push({ path: location, name: installed.name, version: installed.version,
      license: installed.license ?? 'unspecified', lockedVersion: locked.version, compatibilityPatch });
  }
  for (const name of Object.keys(manifest.dependencies)) {
    assert.ok(packages.some(p => p.path === 'node_modules/' + name), 'Missing direct package ' + name);
  }
  const env = { ...process.env, PATH: '', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' };
  const banner = execFileSync(node, [path.join(staged, 'cli.cjs'), '--version'],
    { cwd: staged, env, encoding: 'utf8', timeout: 60000 }).trim();
  assert.match(banner, /2\.1\.88-trylo/);
  const help = execFileSync(node, [path.join(staged, 'cli.cjs'), '--help'],
    { cwd: staged, env, encoding: 'utf8', timeout: 60000 });
  assert.match(help, /--input-format/);
  assert.match(help, /--output-format/);
  writeFileSync(path.join(staged, 'NOTICE.txt'),
    'Trylo legacy compatibility runtime, 2.1.88-trylo.\n' +
    'Instrumented reconstruction of Claude Code 2.1.88; this is not the new Trylo CLI.\n' +
    'Third-party names and copyrights remain with their respective owners.\n' +
    'Package license files are preserved under node_modules; this bundle does not grant a new license to upstream code.\n');
  const files = [];
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, item.name);
      assert.ok(!lstatSync(p).isSymbolicLink(), 'Redirected bundle entry ' + p);
      if (item.isDirectory()) walk(p);
      else if (item.isFile()) {
        const bytes = readFileSync(p);
        files.push({ path: path.relative(staged, p).replaceAll(path.sep, '/'),
          bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  walk(staged);
  files.sort((a,b) => a.path.localeCompare(b.path));
  const inventory = JSON.stringify(files, null, 2) + '\n';
  writeFileSync(path.join(staged, 'files.json'), inventory);
  writeFileSync(path.join(staged, 'manifest.json'), JSON.stringify({
    kind: 'trylo-legacy-runtime', protocol: 'legacy-stream-json', version: manifest.version,
    entry: 'cli.cjs', sha256: hash(executable), sourceSha256: hash(input), redactedEmbeddedCredentials,
    lockSha256: hash(readFileSync(path.join(source, 'package-lock.json'))),
    nodeSha256: hash(readFileSync(node)), banner, dependencies: packages,
    fileInventory: { path: 'files.json', count: files.length, sha256: hash(inventory) },
    isolatedSmoke: { noSystemNode: true, version: true, streamJsonFlags: true },
  }, null, 2) + '\n');
  const backup = target + '-previous';
  if (existsSync(backup)) {
    assert.equal(path.dirname(realpathSync(backup)), realpathSync(resources));
    assert.ok(!lstatSync(backup).isSymbolicLink());
    rmSync(backup, { recursive: true, force: true });
  }
  assert.equal(path.dirname(realpathSync(staged)), realpathSync(resources));
  if (existsSync(target)) renameSync(target, backup);
  try { renameSync(staged, target); }
  catch (error) { if (existsSync(backup)) renameSync(backup, target); throw error; }
  console.log('Legacy CLI staged: ' + packages.length + ' packages, ' + files.length + ' files; ' + banner);
} finally {
  assert.equal(path.dirname(staged), resources);
  rmSync(staged, { recursive: true, force: true });
}
