import dotenv from 'dotenv';

// Local runs only: loads .env.local / .env (.env.local wins). It is a separate module imported FIRST by the entry
// points so the variables exist before any other module reads process.env at load time. On Vercel the variables come
// from the project settings and no file is present, so this is a no-op.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });
