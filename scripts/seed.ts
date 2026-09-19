import { config } from 'dotenv';
import {
  INITIAL_TENANTS,
  getTechCorpSeedData,
  getVarejoBrSeedData,
  getBioSaudeSeedData
} from '../server/tenant/masterSeed.js';
import { seedTenantData, TenantSeedData } from '../server/tenant/seedTenant.js';
import { AuthService } from '../server/auth/AuthService.js';
import { PLAN_ROUTINES } from '../src/access.js';
import { closePool, getPool, withTransaction } from '../server/db/pool.js';

config({ path: ['.env.local', '.env'], quiet: true });

const SEEDS: Record<string, () => TenantSeedData> = {
  'tenant-techcorp': getTechCorpSeedData as () => TenantSeedData,
  'tenant-varejobr': getVarejoBrSeedData as () => TenantSeedData,
  'tenant-biosaude': getBioSaudeSeedData as () => TenantSeedData
};

/**
 * Idempotent: platform admin + demo organizations. A tenant that already exists is
 * left untouched (never overwritten), so this is safe to re-run.
 */
async function main() {
  const admin = await AuthService.getInstance().ensureDefaultSuperAdmin();
  console.log(admin.created ? `SuperAdmin criado: ${admin.email}` : `SuperAdmin já existe: ${admin.email}`);

  for (const tenant of INITIAL_TENANTS) {
    const seedFactory = SEEDS[tenant.id];
    const seeded = await withTransaction(async tx => {
      const exists = await tx.query('select 1 from public.tenants where id = $1', [tenant.id]);
      if (exists.rowCount) return false;

      await tx.query(
        `insert into public.tenants
           (id, slug, name, trading_name, document, contact_email, logo_url, status, plan, created_at, features, enabled_routines)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          tenant.id, tenant.slug, tenant.name, tenant.tradingName, tenant.document, tenant.contactEmail,
          tenant.logoUrl ?? null, tenant.status, tenant.plan, tenant.createdAt,
          JSON.stringify(tenant.features), PLAN_ROUTINES[tenant.plan]
        ]
      );
      if (seedFactory) await seedTenantData(tx, tenant.id, seedFactory());
      return true;
    });
    console.log(`${seeded ? 'Criada  ' : 'Já existe'} ${tenant.slug}`);
  }

  // No audit history is seeded: the platform audit trail only ever contains real events.

  await closePool();
}

main().catch(async err => {
  console.error('Seed falhou:', err.message);
  await closePool();
  process.exit(1);
});
