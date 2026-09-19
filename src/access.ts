import type { UserRole } from './types.js';

/**
 * Role-based access matrix. Single source of truth: the server enforces it on every
 * route and the UI uses it to hide what a role cannot use.
 * SUPER_ADMIN (Conta Mãe) is not listed: it may act inside any organization.
 */
export const ADMIN: UserRole[] = ['ORG_ADMIN'];
export const RECRUITING: UserRole[] = ['ORG_ADMIN', 'RECRUITER'];
export const HR_STAFF: UserRole[] = ['ORG_ADMIN', 'RECRUITER', 'HIRING_MANAGER'];
export const HIRING_TEAM: UserRole[] = ['ORG_ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER'];
export const EVERYONE: UserRole[] = ['ORG_ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COLLABORATOR'];

/** Modules (sidebar ids) each role may open. Module 1 is the SuperAdmin console. */
export const MODULE_ACCESS: Record<number, UserRole[]> = {
  2: HIRING_TEAM, // Usuários
  3: EVERYONE,    // DNA
  4: EVERYONE,    // Estrutura
  5: EVERYONE,    // Cargos
  6: EVERYONE,    // Vagas
  7: HIRING_TEAM, // Candidatos
  8: HR_STAFF,    // Processo seletivo
  9: HR_STAFF,    // Avaliação IA
  10: HIRING_TEAM, // Entrevistas
  11: HR_STAFF,   // Propostas
  12: HR_STAFF,   // Onboarding
  13: HR_STAFF,   // Desenvolvimento
  14: HR_STAFF,   // Retenção
  15: HR_STAFF    // Indicadores
};

export function canAccessModule(role: UserRole, moduleId: number): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (moduleId === 1) return false; // Organizações (Conta Mãe)
  const allowed = MODULE_ACCESS[moduleId];
  return allowed ? allowed.includes(role) : true;
}

/** Password policy for user-chosen passwords (temporary ones are generated). */
export const PASSWORD_MIN_LENGTH = 8;
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'A senha deve conter letras e números.';
  return null;
}
