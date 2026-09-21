import type { AccessProfile, OrgMembership, Page, PlatformUser, TenantUser } from '../../src/types.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_PROFILES,
  effectivePermissions,
  isSubset,
  normalizePermissions
} from '../../src/access.js';
import { sessionCache } from '../cache.js';
import { Queryable } from '../db/pool.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { TenantRepository } from '../tenant/TenantRepository.js';

/** Who is performing an access-control change (needed for the privilege-escalation guards). */
export interface AccessActor {
  /** Membership id (or SuperAdmin id). */
  id: string;
  permissions: readonly string[];
}

export interface MemberInput {
  id?: string;
  name: string;
  email: string;
  profileId: string;
  /** Only for system-generated members (seed, provisioning). People are given a Cargo through `positionId`. */
  jobTitle?: string;
  /** A registered Cargo (module Cargos): the person's cargo is always chosen there, never typed. */
  positionId?: string;
  departmentId?: string;
  avatarUrl?: string;
  active?: boolean;
  lastLoginAt?: string;
  /** Desired EFFECTIVE permissions; the difference against the profile is stored as exceptions. */
  permissions?: unknown;
}

export interface MemberPatch {
  name?: string;
  /** A registered Cargo, or null to leave the person without one. */
  positionId?: string | null;
  departmentId?: string | null;
  profileId?: string;
  active?: boolean;
  permissions?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const toProfile = (r: Record<string, any>): AccessProfile => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isAdmin: r.is_admin,
  isSystem: r.is_system,
  permissions: r.is_admin ? [...ALL_PERMISSIONS] : (r.permissions as string[]),
  ...(r.member_count !== undefined ? { memberCount: Number(r.member_count) } : {})
});

const MEMBER_SELECT = `
  select tu.id, tu.user_id, tu.tenant_id, tu.name, tu.email, tu.profile_id, tu.department_id, tu.job_title, tu.position_id,
         tu.avatar_url, tu.active, tu.last_login_at, tu.granted_permissions, tu.revoked_permissions,
         ap.name as profile_name, ap.is_admin, ap.permissions as profile_permissions
    from public.tenant_users tu
    join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id`;

const toMember = (r: Record<string, any>): TenantUser => ({
  id: r.id,
  tenantId: r.tenant_id,
  userId: r.user_id,
  name: r.name,
  email: r.email,
  profileId: r.profile_id,
  profileName: r.profile_name,
  ...(r.department_id ? { departmentId: r.department_id } : {}),
  jobTitle: r.job_title,
  ...(r.position_id ? { positionId: r.position_id } : {}),
  ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
  active: r.active,
  ...(r.last_login_at ? { lastLoginAt: r.last_login_at } : {}),
  grantedPermissions: r.granted_permissions,
  revokedPermissions: r.revoked_permissions,
  permissions: effectivePermissions(
    { isAdmin: r.is_admin, permissions: r.profile_permissions },
    r.granted_permissions,
    r.revoked_permissions
  )
});

/** The title of a registered Cargo of this organization; refuses anything that is not in the Cargos module. */
async function positionTitle(db: Queryable, tenantId: string, positionId: string): Promise<string> {
  const { rows } = await db.query('select title, status from public.job_positions where tenant_id = $1 and id = $2', [tenantId, positionId]);
  if (!rows[0]) throw new ValidationError('Cargo não encontrado no cadastro de Cargos desta organização.');
  if (rows[0].status !== 'active') throw new ValidationError('Este cargo está arquivado. Escolha um cargo ativo do cadastro.');
  return rows[0].title as string;
}

/** Exceptions that turn the profile's permissions into the desired effective set. */
function exceptionsFor(profile: AccessProfile, desired: readonly string[]) {
  if (profile.isAdmin) return { granted: [] as string[], revoked: [] as string[] };
  const base = new Set(profile.permissions);
  const want = new Set(desired);
  return {
    granted: ALL_PERMISSIONS.filter(p => want.has(p) && !base.has(p)),
    revoked: ALL_PERMISSIONS.filter(p => base.has(p) && !want.has(p))
  };
}

function cleanPermissions(input: unknown): string[] {
  const { permissions, invalid } = normalizePermissions(input);
  if (invalid.length) throw new ValidationError(`Permissões desconhecidas: ${invalid.join(', ')}`);
  return permissions;
}

/** Nobody can hand out (or manage someone holding) more than they hold themselves. */
function assertCanGrant(actor: AccessActor, permissions: readonly string[]) {
  if (!isSubset(permissions, actor.permissions)) {
    throw new ForbiddenError('Você só pode liberar permissões que você mesmo possui.');
  }
}

/** Page/size limits and the LIKE-safe lowercase search prefix shared by the paginated lists. */
function paging(opts: { search?: string; page?: number; pageSize?: number }) {
  return {
    pageSize: Math.min(Math.max(Math.trunc(opts.pageSize || 25), 1), 100),
    page: Math.max(Math.trunc(opts.page || 1), 1),
    term: (opts.search ?? '').trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m)
  };
}

export const AccessService = {
  // ---------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------
  /** Creates the default profiles of an organization (idempotent). */
  async ensureSystemProfiles(db: Queryable, tenantId: string): Promise<void> {
    for (const p of DEFAULT_PROFILES) {
      await db.query(
        `insert into public.access_profiles (tenant_id, id, name, description, is_admin, is_system, permissions)
         values ($1, $2, $3, $4, $5, true, $6)
         on conflict (tenant_id, id) do nothing`,
        [tenantId, p.id, p.name, p.description, p.isAdmin, p.isAdmin ? [] : p.permissions]
      );
    }
  },

  async listProfiles(db: Queryable, tenantId: string): Promise<AccessProfile[]> {
    const { rows } = await db.query(
      `select ap.*, (select count(*) from public.tenant_users tu
                      where tu.tenant_id = ap.tenant_id and tu.profile_id = ap.id) as member_count
         from public.access_profiles ap where ap.tenant_id = $1 order by ap.is_system desc, ap.seq`,
      [tenantId]
    );
    return rows.map(toProfile);
  },

  async getProfile(db: Queryable, tenantId: string, id: string, lock = false): Promise<AccessProfile | undefined> {
    const { rows } = await db.query(
      `select * from public.access_profiles where tenant_id = $1 and id = $2${lock ? ' for update' : ''}`,
      [tenantId, id]
    );
    return rows[0] ? toProfile(rows[0]) : undefined;
  },

  async createProfile(
    db: Queryable,
    tenantId: string,
    input: { name: unknown; description?: unknown; permissions: unknown },
    actor: AccessActor
  ): Promise<AccessProfile> {
    const name = text(input.name);
    if (!name) throw new ValidationError('Campo obrigatório: name');
    const permissions = cleanPermissions(input.permissions);
    assertCanGrant(actor, permissions);
    try {
      const { rows } = await db.query(
        `insert into public.access_profiles (tenant_id, id, name, description, is_admin, is_system, permissions)
         values ($1, $2, $3, $4, false, false, $5) returning *`,
        [tenantId, newId('prf'), name, text(input.description), permissions]
      );
      return toProfile({ ...rows[0], member_count: 0 });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictError('Já existe um perfil com este nome.');
      throw err;
    }
  },

  async updateProfile(
    db: Queryable,
    tenantId: string,
    id: string,
    input: { name?: unknown; description?: unknown; permissions?: unknown },
    actor: AccessActor
  ): Promise<AccessProfile> {
    sessionCache.clear();
    const current = await AccessService.getProfile(db, tenantId, id, true);
    if (!current) throw new NotFoundError('Perfil de acesso não encontrado.');
    if (current.isAdmin) throw new ForbiddenError('O perfil de administrador não pode ser alterado.');

    const name = input.name === undefined ? current.name : text(input.name);
    if (!name) throw new ValidationError('O nome do perfil não pode ficar vazio.');
    const permissions = input.permissions === undefined ? current.permissions : cleanPermissions(input.permissions);
    assertCanGrant(actor, permissions.filter(p => !current.permissions.includes(p)));
    try {
      await db.query(
        `update public.access_profiles set name = $3, description = $4, permissions = $5
          where tenant_id = $1 and id = $2`,
        [tenantId, id, name, input.description === undefined ? current.description : text(input.description), permissions]
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictError('Já existe um perfil com este nome.');
      throw err;
    }
    return (await AccessService.listProfiles(db, tenantId)).find(p => p.id === id)!;
  },

  async deleteProfile(db: Queryable, tenantId: string, id: string): Promise<AccessProfile> {
    const current = await AccessService.getProfile(db, tenantId, id, true);
    if (!current) throw new NotFoundError('Perfil de acesso não encontrado.');
    if (current.isSystem) throw new ForbiddenError('Perfis do sistema não podem ser excluídos.');
    const { rows } = await db.query(
      'select count(*)::int as n from public.tenant_users where tenant_id = $1 and profile_id = $2',
      [tenantId, id]
    );
    if (rows[0].n > 0) {
      throw new ConflictError(`Existem ${rows[0].n} usuário(s) neste perfil. Mova-os para outro perfil antes de excluir.`);
    }
    await db.query('delete from public.access_profiles where tenant_id = $1 and id = $2', [tenantId, id]);
    return current;
  },

  // ---------------------------------------------------------------------
  // Members (links between identities and the organization)
  // ---------------------------------------------------------------------
  async listMembers(db: Queryable, tenantId: string): Promise<TenantUser[]> {
    // Lookup list (names for owners, approvers...). Bounded; the management screens use listMembersPage.
    const { rows } = await db.query(`${MEMBER_SELECT} where tu.tenant_id = $1 order by tu.seq limit 2000`, [tenantId]);
    return rows.map(toMember);
  },

  /**
   * Members of one organization, searched (name / e-mail prefix) and paginated in the database.
   * Every statement is scoped by tenant_id.
   */
  async listMembersPage(
    db: Queryable,
    tenantId: string,
    opts: { search?: string; page?: number; pageSize?: number }
  ): Promise<Page<TenantUser>> {
    const { pageSize, page, term } = paging(opts);
    const { rows } = await db.query(
      `${MEMBER_SELECT.replace('select tu.id,', 'select count(*) over ()::int as total_rows, tu.id,')}
        where tu.tenant_id = $1 and ($2 = '' or lower(tu.name) like $2 || '%' or lower(tu.email) like $2 || '%')
        order by tu.seq limit $3 offset $4`,
      [tenantId, term, pageSize, (page - 1) * pageSize]
    );
    return { items: rows.map(toMember), total: rows[0]?.total_rows ?? 0, page, pageSize };
  },

  // ---------------------------------------------------------------------
  // Global identities (Conta Mãe)
  // ---------------------------------------------------------------------
  /** People across the platform with their links, newest first; searched by name / e-mail prefix. */
  async listIdentities(db: Queryable, opts: { search?: string; page?: number; pageSize?: number; onlyId?: string }): Promise<Page<PlatformUser>> {
    const { pageSize, page, term } = paging(opts);
    const { rows } = await db.query(
      `select au.id, au.name, au.email, au.active, au.created_at, au.last_login_at,
              count(*) over ()::int as total_rows,
              coalesce((
                select json_agg(json_build_object(
                         'tenantId', t.id, 'tenantName', t.name, 'slug', t.slug, 'membershipId', tu.id,
                         'profileId', tu.profile_id, 'profileName', ap.name, 'active', tu.active) order by t.name)
                  from public.tenant_users tu
                  join public.tenants t on t.id = tu.tenant_id
                  join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
                 where tu.user_id = au.id
              ), '[]'::json) as links
         from public.app_users au
        where ($4::text is null or au.id = $4)
          and ($1 = '' or lower(au.name) like $1 || '%' or lower(au.email) like $1 || '%')
        order by au.created_at desc, au.id
        limit $2 offset $3`,
      [term, pageSize, (page - 1) * pageSize, opts.onlyId ?? null]
    );
    return {
      items: rows.map(r => ({
        id: r.id, name: r.name, email: r.email, active: r.active, createdAt: r.created_at,
        ...(r.last_login_at ? { lastLoginAt: r.last_login_at } : {}),
        links: r.links
      })),
      total: rows[0]?.total_rows ?? 0,
      page,
      pageSize
    };
  },

  /** New person without any organization link (the caller issues the temporary password). */
  async createIdentity(db: Queryable, input: { name: unknown; email: unknown }): Promise<string> {
    const name = text(input.name);
    const email = text(input.email).toLowerCase();
    if (!name) throw new ValidationError('Campo obrigatório: name');
    if (!EMAIL_RE.test(email)) throw new ValidationError('E-mail inválido.');
    const { rows } = await db.query(
      'insert into public.app_users (id, name, email) values ($1, $2, $3) on conflict do nothing returning id',
      [newId('acc'), name, email]
    );
    if (!rows[0]) throw new ConflictError('Já existe um usuário com este e-mail. Use "Vincular" para dar acesso a uma organização.');
    return rows[0].id;
  },

  /** Platform-level switch: a deactivated person cannot log in anywhere and loses every session. */
  async setIdentityActive(db: Queryable, userId: string, active: boolean, name?: unknown): Promise<PlatformUser> {
    const newName = name === undefined ? null : text(name);
    if (newName === '') throw new ValidationError('O nome não pode ficar vazio.');
    const { rowCount } = await db.query(
      'update public.app_users set active = $2, name = coalesce($3, name) where id = $1',
      [userId, active, newName]
    );
    if (!rowCount) throw new NotFoundError('Usuário não encontrado.');
    if (!active) await db.query("delete from public.auth_sessions where principal_type = 'tenant_user' and principal_id = $1", [userId]);
    sessionCache.clear();
    return (await AccessService.listIdentities(db, { onlyId: userId, pageSize: 1 })).items[0];
  },

  async getMember(db: Queryable, tenantId: string, id: string, lock = false): Promise<TenantUser | undefined> {
    const { rows } = await db.query(
      `${MEMBER_SELECT} where tu.tenant_id = $1 and tu.id = $2${lock ? ' for update of tu' : ''}`,
      [tenantId, id]
    );
    return rows[0] ? toMember(rows[0]) : undefined;
  },

  /**
   * Links a person to the organization. The identity is created (without password: the caller issues the temporary
   * one when `identityCreated`), or — only with `opts.linkExisting`, i.e. from the Conta Mãe — an existing one is found
   * by e-mail. Never touches an existing identity's credentials.
   */
  async addMember(
    db: Queryable,
    tenantId: string,
    input: MemberInput,
    actor?: AccessActor,
    opts: { linkExisting?: boolean } = {}
  ): Promise<{ member: TenantUser; identityId: string; identityCreated: boolean }> {
    const name = text(input.name);
    const email = text(input.email).toLowerCase();
    if (!name) throw new ValidationError('Campo obrigatório: name');
    if (!email) throw new ValidationError('Campo obrigatório: email');
    if (!EMAIL_RE.test(email)) throw new ValidationError('E-mail inválido.');

    const profile = await AccessService.getProfile(db, tenantId, text(input.profileId));
    if (!profile) throw new ValidationError('Perfil de acesso inválido.');
    const desired = input.permissions === undefined ? profile.permissions : cleanPermissions(input.permissions);
    const { granted, revoked } = exceptionsFor(profile, desired);
    if (actor) assertCanGrant(actor, effectivePermissions(profile, granted, revoked));

    const dup = await db.query(
      'select 1 from public.tenant_users where tenant_id = $1 and lower(email) = $2',
      [tenantId, email]
    );
    if (dup.rowCount) throw new ConflictError('Este usuário já está vinculado a esta organização.');

    const created = await db.query(
      `insert into public.app_users (id, name, email) values ($1, $2, $3)
       on conflict do nothing returning id`,
      [newId('acc'), name, email]
    );
    const identityCreated = !!created.rowCount;
    // One person in several organizations is a platform decision: only the Conta Mãe (linkExisting) may attach an
    // account that already exists. Organization admins can only register e-mails that are new to the platform.
    // (Checked after the insert, so two simultaneous registrations of the same e-mail cannot slip through.)
    if (!identityCreated && !opts.linkExisting) {
      throw new ForbiddenError(
        'Este e-mail não pode ser cadastrado por aqui. Para dar acesso a uma pessoa que já possui conta na plataforma ' +
        '(por exemplo, em outra organização), solicite à Conta Mãe.'
      );
    }
    const identityId: string =
      created.rows[0]?.id ??
      (await db.query('select id from public.app_users where lower(email) = $1', [email])).rows[0].id;

    const membershipId = input.id ?? newId('usr');
    await new TenantRepository(tenantId).users.insert(
      {
        id: membershipId,
        userId: identityId,
        name,
        email,
        profileId: profile.id,
        departmentId: input.departmentId || undefined,
        // the cargo is the registered one (its title); only system-generated members carry a plain label
        jobTitle: input.positionId ? await positionTitle(db, tenantId, input.positionId) : text(input.jobTitle) || 'Colaborador',
        positionId: input.positionId || undefined,
        avatarUrl: input.avatarUrl,
        active: input.active ?? true,
        lastLoginAt: input.lastLoginAt, // never used yet = no last access (does not count as "most recently used")
        grantedPermissions: granted,
        revokedPermissions: revoked
      },
      db
    );
    return { member: (await AccessService.getMember(db, tenantId, membershipId))!, identityId, identityCreated };
  },

  async updateMember(
    db: Queryable,
    tenantId: string,
    id: string,
    patch: MemberPatch,
    actor: AccessActor
  ): Promise<TenantUser> {
    sessionCache.clear();
    const current = await AccessService.getMember(db, tenantId, id, true);
    if (!current) throw new NotFoundError('Usuário não encontrado nesta organização.');
    if (current.id === actor.id) throw new ForbiddenError('Você não pode alterar o seu próprio acesso.');
    assertCanGrant(actor, current.permissions!); // cannot manage someone who can do more than you

    const profileChanged = patch.profileId !== undefined && patch.profileId !== current.profileId;
    const profile = await AccessService.getProfile(db, tenantId, profileChanged ? text(patch.profileId) : current.profileId);
    if (!profile) throw new ValidationError('Perfil de acesso inválido.');

    let granted = current.grantedPermissions;
    let revoked = current.revokedPermissions;
    if (patch.permissions !== undefined) {
      ({ granted, revoked } = exceptionsFor(profile, cleanPermissions(patch.permissions)));
    } else if (profileChanged) {
      granted = [];
      revoked = [];
    }
    const effective = effectivePermissions(profile, granted, revoked);
    assertCanGrant(actor, effective);

    const active = patch.active ?? current.active;
    const currentProfile = (await AccessService.getProfile(db, tenantId, current.profileId))!;
    if (current.active && currentProfile.isAdmin && !(active && profile.isAdmin)) {
      await AccessService.assertAnotherAdmin(db, tenantId, id);
    }

    const name = patch.name === undefined ? current.name : text(patch.name);
    if (!name) throw new ValidationError('O nome não pode ficar vazio.');
    // Cargo: always a registered one. Clearing it keeps the last title only as a label of "not linked".
    let positionId: string | null = current.positionId ?? null;
    let jobTitle = current.jobTitle;
    if (patch.positionId !== undefined) {
      positionId = patch.positionId ? text(patch.positionId) : null;
      if (positionId) jobTitle = await positionTitle(db, tenantId, positionId);
    }
    await db.query(
      `update public.tenant_users
          set name = $3, job_title = $4, department_id = $5, profile_id = $6, active = $7,
              granted_permissions = $8, revoked_permissions = $9, position_id = $10
        where tenant_id = $1 and id = $2`,
      [
        tenantId, id, name, jobTitle,
        patch.departmentId === undefined ? current.departmentId ?? null : patch.departmentId || null,
        profile.id, active, granted, revoked, positionId
      ]
    );
    if (!active) {
      await db.query(
        `delete from public.auth_sessions where principal_type = 'tenant_user' and tenant_id = $1 and principal_id = $2`,
        [tenantId, current.userId]
      );
    }
    return (await AccessService.getMember(db, tenantId, id))!;
  },

  /** The organization must always keep at least one other active administrator. */
  async assertAnotherAdmin(db: Queryable, tenantId: string, exceptMemberId: string): Promise<void> {
    const { rows } = await db.query(
      `select tu.id from public.tenant_users tu
         join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
        where tu.tenant_id = $1 and tu.active and ap.is_admin and tu.id <> $2
          for update of tu`,
      [tenantId, exceptMemberId]
    );
    if (!rows.length) throw new ConflictError('A organização precisa manter ao menos um administrador ativo.');
  },

  /**
   * A password belongs to the PERSON, not to one organization. An organization admin may only issue a
   * temporary password to someone who is linked to no other organization; otherwise they could take over
   * the account in organizations they do not control.
   */
  async assertPasswordResettable(db: Queryable, tenantId: string, member: TenantUser, actor: AccessActor): Promise<void> {
    if (member.id === actor.id) throw new ForbiddenError('Use “Alterar senha” para trocar a sua própria senha.');
    assertCanGrant(actor, member.permissions!);
    const { rows } = await db.query(
      'select count(*)::int as n from public.tenant_users where user_id = $1 and tenant_id <> $2',
      [member.userId, tenantId]
    );
    if (rows[0].n > 0) {
      throw new ConflictError(
        'Este usuário também está vinculado a outras organizações e a senha é única por pessoa. ' +
        'Peça para ele usar “Alterar senha” ou acione o suporte da plataforma.'
      );
    }
  },

  /** Active links of an identity (organization switcher). */
  async membershipsOf(db: Queryable, userId: string): Promise<OrgMembership[]> {
    const { rows } = await db.query(
      `select t.id as tenant_id, t.slug, t.name, ap.name as profile_name
         from public.tenant_users tu
         join public.tenants t on t.id = tu.tenant_id
         join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
        where tu.user_id = $1 and tu.active and t.status <> 'suspended'
        order by t.name`,
      [userId]
    );
    return rows.map(r => ({ tenantId: r.tenant_id, slug: r.slug, name: r.name, profileName: r.profile_name }));
  }
};
