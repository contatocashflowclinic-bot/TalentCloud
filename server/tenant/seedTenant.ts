import type { PoolClient } from 'pg';
import { TenantRepository } from './TenantRepository.js';
import type { OrganizationalDNA, TenantIndicators } from '../../src/types.js';

type Rows = Record<string, unknown>[];

/** Shape produced by the seed factories in masterSeed.ts (and by provisioning). */
export interface TenantSeedData {
  dna?: OrganizationalDNA;
  users?: Rows;
  departments?: Rows;
  positions?: Rows;
  openings?: Rows;
  candidates?: Rows;
  applications?: Rows;
  aiEvaluations?: Rows;
  interviews?: Rows;
  offers?: Rows;
  onboardings?: Rows;
  developmentRecords?: Rows;
  climateSurveys?: Rows;
  turnoverAlerts?: Rows;
  indicators?: TenantIndicators;
}

/**
 * Inserts a tenant's initial data inside the caller's transaction.
 * Order respects the composite foreign keys (departments -> positions -> openings -> ...).
 */
export async function seedTenantData(tx: PoolClient, tenantId: string, data: TenantSeedData): Promise<void> {
  const repo = new TenantRepository(tenantId);

  if (data.dna) {
    const { tenantId: _ignored, ...dna } = data.dna;
    await repo.upsertDna(dna, tx);
  }
  for (const row of data.users ?? []) await repo.users.insert(row, tx);
  for (const row of data.departments ?? []) await repo.departments.insert(row, tx);
  for (const row of data.positions ?? []) await repo.positions.insert(row, tx);
  for (const row of data.openings ?? []) await repo.openings.insert(row, tx);
  for (const row of data.candidates ?? []) await repo.candidates.insert(row, tx);
  for (const row of data.applications ?? []) await repo.applications.insert(row, tx);
  for (const row of data.aiEvaluations ?? []) await repo.aiEvaluations.insert(row, tx);
  for (const row of data.interviews ?? []) await repo.interviews.insert(row, tx);
  for (const row of data.offers ?? []) await repo.offers.insert(row, tx);
  for (const row of data.onboardings ?? []) await repo.onboardings.insert(row, tx);
  for (const row of data.developmentRecords ?? []) await repo.development.insert(row, tx);
  for (const row of data.climateSurveys ?? []) await repo.climateSurveys.insert(row, tx);
  for (const row of data.turnoverAlerts ?? []) await repo.turnoverAlerts.insert(row, tx);
  if (data.indicators) {
    const { tenantId: _ignored, ...indicators } = data.indicators;
    await repo.upsertIndicators(indicators, tx);
  }
}
