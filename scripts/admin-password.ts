import '../server/env.js';
import { closePool, getPool } from '../server/db/pool.js';
import { hashPassword } from '../server/auth/password.js';
import { logAudit } from '../server/audit.js';
import { passwordPolicyError } from '../src/access.js';

/**
 * Sets the SuperAdmin (Conta Mãe) password. Run it once before exposing the system (see docs/deploy-vercel.md):
 * the install-time password is public, and a production deployment refuses that account until it is replaced.
 *
 *   npm run admin:password                       (asks for the new password, typed hidden)
 *   SUPERADMIN_NEW_PASSWORD=... npm run admin:password   (non-interactive)
 *   ... -- someone@company.com                   (optional: which admin, default = the first active one)
 *
 * The password is never accepted as a command-line argument (it would stay in the shell history).
 */
const DEFAULT_PASSWORD = 'Admin@123';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Sem terminal interativo: defina SUPERADMIN_NEW_PASSWORD.'));
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') { // Ctrl+C
          stdin.setRawMode(false);
          return reject(new Error('Cancelado.'));
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); // backspace
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const emailArg = process.argv[2]?.trim().toLowerCase();
  let password = process.env.SUPERADMIN_NEW_PASSWORD;
  if (!password) {
    password = await askHidden('Nova senha da Conta Mãe: ');
    const confirm = await askHidden('Repita a nova senha:     ');
    if (password !== confirm) throw new Error('As senhas não conferem.');
  }
  if (password === DEFAULT_PASSWORD) throw new Error('Escolha uma senha diferente da senha padrão de instalação.');
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);

  const pool = getPool();
  const { rows } = await pool.query(
    `select id, name, email from public.platform_admins
      where password_hash is not null and active and ($1::text is null or lower(email) = $1)
      order by created_at limit 1`,
    [emailArg ?? null]
  );
  const admin = rows[0];
  if (!admin) throw new Error(emailArg ? `Nenhum SuperAdmin ativo com o e-mail ${emailArg}.` : 'Nenhum SuperAdmin ativo encontrado.');

  const hash = await hashPassword(password);
  await pool.query(
    `update public.platform_admins
        set password_hash = $2, must_change_password = false, password_changed_at = now()
      where id = $1`,
    [admin.id, hash]
  );
  // Every open session of this account is closed
  await pool.query(`delete from public.auth_sessions where principal_type = 'super_admin' and principal_id = $1`, [admin.id]);
  await logAudit({
    tenantId: '',
    userId: admin.id,
    userName: admin.name,
    action: 'SUPERADMIN_PASSWORD_SET',
    category: 'ACCESS_CONTROL',
    details: `Senha da Conta Mãe '${admin.email}' definida pelo script administrativo`,
    ipAddress: 'cli',
    databaseAffected: 'platform_admins'
  });
  console.log(`Senha da Conta Mãe (${admin.email}) atualizada. Sessões abertas foram encerradas.`);
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
