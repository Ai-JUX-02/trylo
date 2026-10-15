// Artifact probes using the same pinned Node that starts this script.
// Exercises native and document assets; does not claim daemon/task readiness.
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const root = path.resolve(process.argv[2]);
assert.equal(process.version, JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')).node, 'Probe with the pinned artifact Node');
const probes = {
  sqlite: `const D=require('better-sqlite3');const db=new D(':memory:');db.exec('CREATE TABLE t(a); INSERT INTO t VALUES(42)');assert.equal(db.prepare('SELECT a FROM t').get().a,42);db.close();`,
  sharp: `const s=require('sharp');const data=await s({create:{width:2,height:2,channels:4,background:'#123456'}}).png().toBuffer();assert.equal((await s(data).metadata()).width,2);`,
  canvas: `for(const name of ['@napi-rs/canvas','pdfjs-dist/node_modules/@napi-rs/canvas']){const {createCanvas}=require(name);const c=createCanvas(32,32);c.getContext('2d').fillText('Trylo',0,12);assert.ok(c.toBuffer('image/png').length>50);}`,
  excel: `const X=require('exceljs');const a=new X.Workbook();a.addWorksheet('Trylo').getCell('A1').value=42;const bytes=await a.xlsx.writeBuffer();const b=new X.Workbook();await b.xlsx.load(bytes);assert.equal(b.getWorksheet('Trylo').getCell('A1').value,42);`,
  word: `const D=require('docx');const data=await D.Packer.toBuffer(new D.Document({sections:[{children:[new D.Paragraph('Trylo package probe')]}]}));const result=await require('mammoth').extractRawText({buffer:data});assert.ok(result.value.includes('Trylo package probe'));`,
  powerpoint: `const P=require('pptxgenjs');const p=new P();p.addSlide().addText('Trylo package probe');const bytes=await p.write({outputType:'nodebuffer'});assert.ok(Buffer.isBuffer(bytes)&&bytes.length>1000);`,
  pdf: `const L=require('pdf-lib');const doc=await L.PDFDocument.create();const page=doc.addPage();page.drawText('Trylo package probe');const bytes=await doc.save();const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:Buffer.from(bytes)});try{const text=await parser.getText();assert.ok(text.text.includes('Trylo package probe'));}finally{await parser.destroy();}`,
};
const results = [];
for (const [name, code] of Object.entries(probes)) {
  const program = `const assert=require('node:assert/strict');const {createRequire}=require('node:module');const requireWork=createRequire(${JSON.stringify(path.join(root, 'package.json'))});(async(require)=>{${code}})(requireWork).catch(error=>{console.error(error.stack);process.exitCode=1});`;
  const started = Date.now();
  const result = spawnSync(process.execPath, ['-e', program], {
    cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8',
    windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  });
  const item = { name, passed: result.status === 0 && !result.error, exitCode: result.status,
    milliseconds: Date.now() - started };
  if (!item.passed) item.detail = result.error?.message ?? result.stderr.slice(-3000);
  results.push(item); console.log(JSON.stringify(item));
}
const report = { kind: 'trylo-workd-package-probes', node: process.version,
  emptyPath: true, passed: results.every(item => item.passed), results,
  daemonControlPlaneAcceptance: false };
if (process.argv[3]) writeFileSync(path.resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
assert.ok(report.passed, 'Work package runtime probe failed; compare with the original artifact before publishing');
