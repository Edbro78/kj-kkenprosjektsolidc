import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Lokalt endepunkt for knappen «Åpne i SolidCraft» (kun når appen kjører med `npm run dev`):
 * POST /api/solidcraft med design-JSON → lagres i rom/<navn>.design.json → tools/tegn.ts --apne.
 */
function solidcraftBridge(): Plugin {
  let running = false;
  return {
    name: 'solidcraft-bridge',
    configureServer(server) {
      // Under utvikling er app.html inngangen; index.html i prosjektmappen er den ferdigbygde fila
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/app.html';
        next();
      });
      server.middlewares.use('/api/solidcraft', (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'Bruk POST' });
        if (running) return reply(409, { ok: false, error: 'SolidCraft bygger allerede et rom. Vent litt.' });
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          let design;
          try {
            design = JSON.parse(raw);
            if (design.schema !== 'design/1') throw new Error();
          } catch {
            return reply(400, { ok: false, error: 'Ugyldig design-JSON' });
          }
          const slug = String(design.room?.name || 'rom').toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '') || 'rom';
          const dir = resolve('rom');
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${slug}.design.json`);
          writeFileSync(file, JSON.stringify(design, null, 2));
          running = true;
          let out = '';
          const p = spawn(process.execPath, ['tools/tegn.ts', file, '--apne'], { cwd: resolve('.') });
          p.stdout.on('data', (d) => (out += d));
          p.stderr.on('data', (d) => (out += d));
          p.on('close', (code) => {
            running = false;
            const line = out.split(/\r?\n/).find((l) => l.startsWith('RESULTAT:'));
            const result = line ? JSON.parse(line.slice(9)) : null;
            reply(result ? 200 : 500, { ok: code === 0 && !!result?.ok, saved: file, result, log: out.replace(/RESULTAT:.*/, '').trim() });
          });
        });
      });
    },
  };
}

// `npm run build` lager én frittstående fil (all kode, stiler og plastdelfiler bakt inn),
// som tools/lag-index.ts kopierer til index.html i prosjektmappen. Den kan åpnes med dobbeltklikk.
export default defineConfig({
  plugins: [react(), solidcraftBridge(), viteSingleFile()],
  assetsInclude: ['**/*.stl', '**/*.3mf'],
  build: { rollupOptions: { input: 'app.html' }, chunkSizeWarningLimit: 8000 },
  server: { port: 5173 },
});
