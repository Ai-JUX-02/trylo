import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

// A separate preview server keeps UI review independent of the live app's
// dev server, watcher and dependency cache.
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  cacheDir: fileURLToPath(new URL('../../spike-results/2026-10-15-event-stream/preview-cache', import.meta.url)),
  plugins: [react()],
  optimizeDeps: { entries: ['prototype/event-stream-acceptance/index.html'] },
  resolve: {
    alias: {
      '@trylo/work': fileURLToPath(new URL('../../../work/src/renderer/index.ts', import.meta.url)),
      react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)),
      'lucide-react': fileURLToPath(new URL('../../node_modules/lucide-react', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 1436, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/spike-results/**'] } },
});
await server.listen();
server.printUrls();
