import type { Express, Request } from 'express';
import type { PoolClient } from 'pg';
import { logAudit } from './audit.js';
import { withTransaction } from './db/pool.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { newId } from './ids.js';
import { consumeQuota } from './rateLimit.js';
import { TenantConnectionRouter } from './tenant/TenantConnectionRouter.js';
import { TenantRepository } from './tenant/TenantRepository.js';

/**
 * Public Careers Portal API (no login).
 * Exposes ONLY what a job seeker should see: open jobs, no salary bands, no internal
 * user ids, no cultural-fit thresholds or behavior criteria. Nothing else is reachable.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPLY_WINDOW_SECONDS = 60 * 60;

/** Writes per IP per hour (PUBLIC_APPLY_LIMIT, default 10). The counter lives in the database, shared by every instance. */
const assertApplyRate = (ip: string, tx: PoolClient) =>
  consumeQuota(
    'public-apply',
    [ip],
    { limit: Number(process.env.PUBLIC_APPLY_LIMIT) || 10, windowSeconds: APPLY_WINDOW_SECONDS },
    'Muitas candidaturas deste endereço. Tente novamente mais tarde.',
    tx
  );

const text = (v: unknown, label: string, max: number, requiredField = false): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (requiredField && !s) throw new ValidationError(`Campo obrigatório: ${label}`);
  if (s.length > max) throw new ValidationError(`${label} excede ${max} caracteres.`);
  return s;
};

const list = (v: unknown, label: string, maxItems: number, maxLen: number): string[] => {
  const items = Array.isArray(v) ? v : String(v ?? '').split(',');
  const out = items.map(x => String(x).trim()).filter(Boolean);
  if (out.length > maxItems || out.some(x => x.length > maxLen)) throw new ValidationError(`${label} inválido.`);
  return out;
};

const ip = (req: Request) => req.ip || '127.0.0.1';

export function registerPublicApi(app: Express, router: TenantConnectionRouter) {
  app.get('/api/public/:slug/careers', async (req, res, next) => {
    try {
      const tenant = await router.getPublicTenant(req.params.slug);
      if (!tenant) throw new NotFoundError('Portal de vagas não encontrado.');
      const db = new TenantRepository(tenant.id);
      const [openings, positions, departments, dna] = await Promise.all([
        db.openings.list(), db.positions.list(), db.departments.list(), db.getDna()
      ]);

      res.json({
        success: true,
        tenant: { slug: tenant.slug, name: tenant.name, tradingName: tenant.tradingName, logoUrl: tenant.logoUrl },
        openings: openings
          .filter(o => o.status === 'open' || o.status === 'in_progress')
          .map(({ hiringManagerId: _h, recruiterId: _r, ...pub }) => pub),
        positions: positions.map(p => ({
          id: p.id, title: p.title, departmentId: p.departmentId, level: p.level, description: p.description,
          technicalRequirements: p.technicalRequirements, behavioralCompetencies: p.behavioralCompetencies,
          careerTrack: p.careerTrack
        })),
        departments: departments.map(d => ({ id: d.id, name: d.name, code: d.code })),
        dna: dna && {
          mission: dna.mission, vision: dna.vision, archetype: dna.archetype, cultureSummary: dna.cultureSummary,
          coreValues: dna.coreValues,
          // Only the positive, marketing-facing side of each pillar; never thresholds or undesired behaviors
          pillars: dna.pillars.map(p => ({
            id: p.id, name: p.name, description: p.description, weight: p.weight,
            expectedBehaviors: p.expectedBehaviors.slice(0, 1)
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/:slug/apply', async (req, res, next) => {
    try {
      const tenant = await router.getPublicTenant(req.params.slug);
      if (!tenant) throw new NotFoundError('Portal de vagas não encontrado.');

      const b = req.body ?? {};
      const email = text(b.email, 'E-mail', 254, true).toLowerCase();
      if (!EMAIL_RE.test(email)) throw new ValidationError('E-mail inválido.');
      const linkedinUrl = text(b.linkedinUrl, 'LinkedIn', 300);
      if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) throw new ValidationError('URL do LinkedIn inválida.');
      const years = Number(b.yearsOfExperience);
      const jobOpeningId = text(b.jobOpeningId, 'Vaga', 100, true);

      const db = new TenantRepository(tenant.id);
      const applicationId = await withTransaction(async tx => {
        const job = await db.openings.get(jobOpeningId, tx);
        if (!job || (job.status !== 'open' && job.status !== 'in_progress')) {
          throw new NotFoundError('Vaga não encontrada ou encerrada.');
        }

        // Only requests that would actually write data count against the limit
        await assertApplyRate(ip(req), tx);

        // Reuse an existing profile for the same e-mail WITHOUT overwriting it (no public edits of others' data)
        const found = await tx.query(
          'select id, archived from public.candidates where tenant_id = $1 and lower(email) = $2 limit 1',
          [tenant.id, email]
        );
        if (found.rows[0]?.archived) {
          await db.candidates.update(found.rows[0].id, { archived: false }, tx);
          await db.candidateChanges.insert({
            id: newId('chg'), candidateId: found.rows[0].id, field: 'archived', oldValue: true, newValue: false, kind: 'update',
            reason: 'Perfil reativado por nova candidatura recebida pelo portal público.', changedBy: 'Portal Público de Vagas'
          }, tx);
        }
        const candidateId: string =
          found.rows[0]?.id ??
          (
            await db.candidates.insert(
              {
                id: newId('cand'),
                name: text(b.name, 'Nome', 120, true),
                email,
                phone: text(b.phone, 'Telefone', 40),
                location: text(b.location, 'Localização', 120),
                linkedinUrl: linkedinUrl || undefined,
                currentRole: text(b.currentRole, 'Cargo atual', 120) || job.title,
                yearsOfExperience: Number.isFinite(years) ? Math.min(Math.max(years, 0), 60) : 0,
                education: text(b.education, 'Formação', 120),
                resumeSummary: text(b.resumeSummary, 'Resumo', 4000),
                skills: list(b.skills, 'Competências', 30, 60),
                languages: ['Português (Nativo)'],
                registeredAt: new Date().toISOString(),
                tags: ['Candidatura Portal Público', job.workModel],
                dataOrigin: 'candidate'
              },
              tx
            )
          ).id;

        const dup = await tx.query(
          'select 1 from public.selection_applications where tenant_id = $1 and job_opening_id = $2 and candidate_id = $3',
          [tenant.id, jobOpeningId, candidateId]
        );
        if (dup.rowCount) throw new ConflictError('Você já se candidatou a esta vaga.');

        const application = await db.createApplication(candidateId, jobOpeningId, newId('app'), tx);

        await logAudit(
          {
            tenantId: tenant.id,
            userId: 'public-portal',
            userName: 'Portal Público de Vagas',
            action: 'PUBLIC_APPLICATION_RECEIVED',
            category: 'CANDIDATE_DATA',
            details: `Candidatura recebida para a vaga '${job.title}'`,
            ipAddress: ip(req),
            databaseAffected: `tenant:${tenant.slug}`
          },
          tx
        );
        return application.id;
      });

      res.status(201).json({ success: true, applicationId });
    } catch (err) {
      next(err);
    }
  });
}
