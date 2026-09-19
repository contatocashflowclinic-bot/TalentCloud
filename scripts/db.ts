import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

config({ path: ['.env.local', '.env'], quiet: true });

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function connect(): pg.Client {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL não definida no .env.local');
  return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

async function ping(client: pg.Client) {
  const { rows } = await client.query('select current_database() as db, current_user as usr, version() as version');
  console.log(rows[0]);
}

async function migrate(client: pg.Client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const applied = new Set((await client.query('select name from public.schema_migrations')).rows.map(r => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log('Nenhuma migration pendente.');
    return;
  }
  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Aplicando ${file}...`);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Falha em ${file} (rollback feito): ${(err as Error).message}`);
    }
  }
  console.log(`${pending.length} migration(s) aplicada(s).`);
}

async function status(client: pg.Client) {
  const exists = (await client.query(`select to_regclass('public.schema_migrations') as t`)).rows[0].t;
  const applied = new Set(
    exists ? (await client.query('select name from public.schema_migrations')).rows.map(r => r.name) : []
  );
  for (const f of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    console.log(`${applied.has(f) ? '[x]' : '[ ]'} ${f}`);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const client = connect();
  await client.connect();
  try {
    switch (cmd) {
      case 'ping': return await ping(client);
      case 'migrate': return await migrate(client);
      case 'status': return await status(client);
      case 'query': {
        const sql = args.join(' ');
        if (!sql) throw new Error('Uso: npm run db -- query "<sql>"');
        const res = await client.query(sql);
        console.table(res.rows);
        return;
      }
      default:
        console.log('Uso: npm run db -- <ping|migrate|status|query "<sql>">');
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
