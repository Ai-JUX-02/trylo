import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const children = [spawn(process.execPath, ['preview/v2/gateway.cjs'], { cwd, stdio: 'inherit', windowsHide: true }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4186', '--strictPort'], { cwd, stdio: 'inherit', windowsHide: true })];
let closing = false;
const stop = () => { closing = true; children.forEach(child => child.kill()); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => { child.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; }); child.on('exit', code => { if (!closing) { stop(); process.exitCode = code || 0; } }); });
console.log('V2 preview: http://127.0.0.1:4186/preview/v2/index.html');
