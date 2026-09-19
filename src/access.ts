/**
 * RBAC catalog. Single source of truth: the server enforces it on every route and the UI
 * uses it to hide what a user cannot use.
 *
 * A permission is `<routine>:<action>`. Each organization has access PROFILES (sets of
 * permissions); a member is linked to one profile and may have individual exceptions
 * (granted / revoked permissions). The `admin` profile always has every permission.
 * SUPER_ADMIN (Conta Mãe) lives outside organizations and may act inside any of them.
 */

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Visualizar',
  create: 'Incluir',
  edit: 'Alterar',
  delete: 'Excluir'
};

export interface Routine {
  key: string;
  label: string;
  description: string;
  /** Sidebar module that hosts the routine (module opens when any of its routines can be viewed). */
  moduleId: number;
  actions: PermissionAction[];
}

export const ROUTINES: Routine[] = [
  { key: 'users', label: 'Usuários', description: 'Vínculos de usuários com a organização, perfil, status e senha temporária.', moduleId: 2, actions: ['view', 'create', 'edit'] },
  { key: 'profiles', label: 'Perfis de acesso', description: 'Perfis e as permissões liberadas por rotina.', moduleId: 2, actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'dna', label: 'DNA Organizacional', description: 'Missão, visão, valores e pilares culturais.', moduleId: 3, actions: ['view', 'edit'] },
  { key: 'structure', label: 'Estrutura Organizacional', description: 'Departamentos e centros de custo.', moduleId: 4, actions: ['view', 'create'] },
  { key: 'positions', label: 'Cargos', description: 'Cargos, competências e faixas salariais.', moduleId: 5, actions: ['view', 'create'] },
  { key: 'openings', label: 'Vagas', description: 'Abertura de vagas e pipeline.', moduleId: 6, actions: ['view', 'create'] },
  { key: 'candidates', label: 'Candidatos', description: 'Banco de talentos.', moduleId: 7, actions: ['view', 'create'] },
  { key: 'selection', label: 'Processo Seletivo', description: 'Candidaturas e movimentação entre etapas.', moduleId: 8, actions: ['view', 'create', 'edit'] },
  { key: 'ai_evaluation', label: 'Avaliação por IA', description: 'Avaliações assistidas por IA e decisão humana final.', moduleId: 9, actions: ['view', 'create', 'edit'] },
  { key: 'interviews', label: 'Entrevistas', description: 'Agendamento e preenchimento de scorecards.', moduleId: 10, actions: ['view', 'create', 'edit'] },
  { key: 'offers', label: 'Propostas', description: 'Ofertas, aprovação e aceite.', moduleId: 11, actions: ['view', 'create', 'edit'] },
  { key: 'onboarding', label: 'Onboarding', description: 'Checklists de integração.', moduleId: 12, actions: ['view', 'edit'] },
  { key: 'development', label: 'Desenvolvimento', description: 'PDI e metas.', moduleId: 13, actions: ['view', 'edit'] },
  { key: 'retention', label: 'Retenção', description: 'Clima e alertas de turnover.', moduleId: 14, actions: ['view', 'edit'] },
  { key: 'indicators', label: 'Indicadores', description: 'People analytics.', moduleId: 15, actions: ['view'] }
];

export const permissionKey = (routine: string, action: PermissionAction) => `${routine}:${action}`;

export const ALL_PERMISSIONS: string[] = ROUTINES.flatMap(r => r.actions.map(a => permissionKey(r.key, a)));
const VALID_PERMISSIONS = new Set(ALL_PERMISSIONS);
export const isValidPermission = (p: string) => VALID_PERMISSIONS.has(p);

/**
 * Cleans a permission list: keeps only known keys (unknown ones are returned in `invalid`),
 * de-duplicates, orders by catalog and adds `view` whenever create/edit/delete is present.
 */
export function normalizePermissions(input: unknown): { permissions: string[]; invalid: string[] } {
  const list = Array.isArray(input) ? input.map(v => String(v)) : [];
  const invalid = [...new Set(list.filter(p => !isValidPermission(p)))];
  const wanted = new Set(list.filter(isValidPermission));
  for (const p of [...wanted]) {
    const [routine] = p.split(':');
    wanted.add(permissionKey(routine, 'view'));
  }
  return { permissions: ALL_PERMISSIONS.filter(p => wanted.has(p)), invalid };
}

export interface ProfileLike {
  isAdmin: boolean;
  permissions: readonly string[];
}

/** (profile ∪ granted) − revoked. The admin profile always holds everything. */
export function effectivePermissions(
  profile: ProfileLike,
  granted: readonly string[] = [],
  revoked: readonly string[] = []
): string[] {
  if (profile.isAdmin) return [...ALL_PERMISSIONS];
  const set = new Set([...profile.permissions, ...granted]);
  for (const p of revoked) set.delete(p);
  return normalizePermissions([...set]).permissions;
}

/** True when every permission in `subset` is also in `superset`. */
export const isSubset = (subset: readonly string[], superset: readonly string[]) => {
  const s = new Set(superset);
  return subset.every(p => s.has(p));
};

/** Whether a member may open an organization sidebar module (modules without routines, like the portal, are open). */
export function canAccessModule(permissions: readonly string[], moduleId: number): boolean {
  const routines = ROUTINES.filter(r => r.moduleId === moduleId);
  if (routines.length === 0) return true;
  return routines.some(r => permissions.includes(permissionKey(r.key, 'view')));
}

// ---------------------------------------------------------------------
// Default profiles created for every organization (ids are stable per tenant)
// ---------------------------------------------------------------------
export const ADMIN_PROFILE_ID = 'admin';

export interface DefaultProfile extends ProfileLike {
  id: string;
  name: string;
  description: string;
}

const BASE_VIEW = ['dna:view', 'structure:view', 'positions:view', 'openings:view'];

export const DEFAULT_PROFILES: DefaultProfile[] = [
  {
    id: ADMIN_PROFILE_ID,
    name: 'Administrador da Organização',
    description: 'Acesso total a todas as rotinas, inclusive usuários e perfis.',
    isAdmin: true,
    permissions: ALL_PERMISSIONS
  },
  {
    id: 'recruiter',
    name: 'Recrutador / RH',
    description: 'Conduz vagas, candidatos, processo seletivo, entrevistas e propostas.',
    isAdmin: false,
    permissions: normalizePermissions([
      ...BASE_VIEW, 'users:view', 'openings:create', 'candidates:create', 'selection:create', 'selection:edit',
      'ai_evaluation:create', 'ai_evaluation:edit', 'interviews:create', 'interviews:edit', 'offers:create',
      'offers:edit', 'onboarding:edit', 'development:edit', 'retention:edit', 'indicators:view'
    ]).permissions
  },
  {
    id: 'hiring_manager',
    name: 'Gestor da Vaga',
    description: 'Acompanha o processo, decide etapas, avalia e aprova propostas.',
    isAdmin: false,
    permissions: normalizePermissions([
      ...BASE_VIEW, 'users:view', 'candidates:view', 'selection:edit', 'ai_evaluation:edit', 'interviews:edit',
      'offers:edit', 'onboarding:edit', 'development:edit', 'retention:edit', 'indicators:view'
    ]).permissions
  },
  {
    id: 'interviewer',
    name: 'Entrevistador',
    description: 'Consulta candidatos e preenche scorecards de entrevistas.',
    isAdmin: false,
    permissions: normalizePermissions([
      ...BASE_VIEW, 'users:view', 'candidates:view', 'interviews:edit'
    ]).permissions
  },
  {
    id: 'collaborator',
    name: 'Colaborador',
    description: 'Consulta DNA, estrutura, cargos e vagas abertas.',
    isAdmin: false,
    permissions: BASE_VIEW
  }
];

/** Password policy for user-chosen passwords (temporary ones are generated). */
export const PASSWORD_MIN_LENGTH = 8;
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'A senha deve conter letras e números.';
  return null;
}
