import { createApp } from '../server/app.js';

/**
 * Vercel Function: the whole Express API in a single function (vercel.json routes every /api/* request here).
 * The static site (Vite build) is served by the CDN, never by this function.
 *
 * `createApp` builds the app once per instance; the database / SuperAdmin checks run lazily on the first request
 * (see ensureBootstrapped in server/app.ts), so a cold start that hit a transient DB error recovers on its own.
 *
 * The Express app is exported as it is (not wrapped in another function): Vercel's Node "helpers" read the whole request
 * body before calling the handler, which would leave nothing for express.json / express.raw ("stream is not readable"),
 * and the runtime skips the helpers for handlers that have `.listen` (an Express app does). vercel.json also sets
 * NODEJS_HELPERS=0 as a second safeguard.
 */
export default createApp({ isProd: true });
