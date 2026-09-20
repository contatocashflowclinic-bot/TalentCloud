/**
 * True on an internet-facing deployment (Vercel, or NODE_ENV=production / the compiled `npm start` bundle).
 * Read at call time (not at module load) so entry points can still set NODE_ENV first.
 */
export const isProduction = (): boolean => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
