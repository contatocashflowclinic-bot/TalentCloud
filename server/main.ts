import './env.js';
import path from 'node:path';
import express from 'express';
import { closePool } from './db/pool.js';
import { createApp, ensureBootstrapped } from './app.js';

/**
 * Local / self-hosted entry point (`npm run dev`, `npm start`). On Vercel this file is NOT used: the static site is
 * served by the CDN and the API by api/index.ts.
 *
 * Production = NODE_ENV=production OR running the compiled bundle (npm start), so "npm start" never boots the Vite dev server.
 */
const IS_COMPILED = typeof __filename !== 'undefined' && __filename.endsWith('.cjs');
if (IS_COMPILED) process.env.NODE_ENV ??= 'production';
const IS_PROD = process.env.NODE_ENV === 'production';

async function start() {
  const PORT = Number(process.env.PORT) || 3000;

  // Fail fast if the database is unreachable
  await ensureBootstrapped();

  const app = createApp({ isProd: IS_PROD });

  if (!IS_PROD) {
    // Imported here (not at the top) so the production bundle never needs the dev tooling
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Vértice 360] Servidor no ar. Abra no navegador: http://localhost:${PORT}`);
    console.log(`[Vértice 360] (0.0.0.0 é só o endereço em que o servidor escuta; não digite 0.0.0.0 no navegador)`);
    console.log(`[Vértice 360] Multi-tenancy routing active - database: Supabase Postgres`);
  });

  const shutdown = () => {
    server.close(() => closePool().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch(err => {
  console.error('Fatal: Failed to start Vértice 360 server:', err);
  process.exit(1);
});
