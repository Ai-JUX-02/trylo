import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, renameSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resources = path.join(root, 'desktop/src-tauri/resources');
const source = realpathSync(process.env.TRYLO_WORKD_ARTIFACT_DIR || '');
const target = path.join(resources, 'workd');
const node = path.join(resources, 'runtime/node/win-x64/node.exe');
const manifestBytes = readFileSync(path.join(source, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.kind, 'trylo-workd-sidecar');
assert.equal(manifest.betterSqlite3Probe, 'ok');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const nodeVersion = execFileSync(node, ['--version'], {encoding:'utf8'}).trim();
assert.equal(nodeVersion, manifest.node, 'Prebuilt Work artifact uses a different Node ABI');
const candidate = mkdtempSync(path.join(resources, 'workd-import-'));
try {
  assert.equal(path.dirname(realpathSync(candidate)), realpathSync(resources));
  try {
    execFileSync('robocopy.exe', [source,candidate,'/E','/XJ','/MT:16','/R:1','/W:1',
      '/NFL','/NDL','/NJH','/NJS','/NP'], {stdio:'inherit',windowsHide:true});
  } catch(error) { if (!(Number.isInteger(error.status) && error.status >= 0 && error.status < 8)) throw error; }
  assert.equal(hash(path.join(candidate,'manifest.json')), hash(path.join(source,'manifest.json')));
  const main = manifest.daemonMain;
  assert.ok(main === 'dist/daemon/daemon/main.js');
  assert.equal(hash(path.join(candidate,main)), hash(path.join(source,main)));
  const checkedOutBuild = path.join(root,'work/vendor/cowork-os',main);
  if (existsSync(checkedOutBuild)) assert.equal(hash(path.join(candidate,main)), hash(checkedOutBuild),
    'Prebuilt daemon differs from the selected checkout build');
  execFileSync(node,['-e',"const D=require('better-sqlite3');const db=new D(':memory:');db.exec('create table t(a)');db.close();"],{
    cwd:candidate,env:{...process.env,PATH:''},timeout:60000,stdio:'inherit',windowsHide:true});
  const bindingCandidates=['build/Release/better_sqlite3.node','prebuilds/win32-x64.node'];
  const binding = bindingCandidates.map(p=>path.join(candidate,'node_modules/better-sqlite3',p)).find(existsSync);
  assert.ok(binding,'Prebuilt SQLite binding missing');
  writeFileSync(path.join(candidate,'import-validation.json'),JSON.stringify({
    sourceArtifactManifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),
    daemonSha256:hash(path.join(candidate,main)),nodeVersion,nodeSha256:hash(node),
    sqliteBindingSha256:hash(binding),betterSqlite3Probe:'ok',noSystemNode:true
  },null,2)+'\n');
  const backup=target+'-before-import';
  assert.ok(!existsSync(backup),'Review existing Work backup first');
  assert.ok(!existsSync(target)||!lstatSync(target).isSymbolicLink(),'Redirected Work target');
  if(existsSync(target))renameSync(target,backup);
  try{renameSync(candidate,target);}
  catch(error){if(existsSync(backup))renameSync(backup,target);throw error;}
  // The partial or previous tree remains outside bundle.resources for review.
  console.log('Prebuilt Work artifact imported; pinned Node and SQLite probe passed');
} finally {
  assert.equal(path.dirname(candidate),resources);
  rmSync(candidate,{recursive:true,force:true});
}
