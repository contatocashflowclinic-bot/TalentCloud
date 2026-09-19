import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isValidPermission } from '../../src/access.js';
import { ForbiddenError, UnauthorizedError } from '../errors.js';
import { AuthenticatedSession, AuthService } from './AuthService.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

const bearer = (req: Request): string => {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

/** Resolves the session from the Bearer token (allowed even while a password change is pending). */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const session = await AuthService.getInstance().authenticate(bearer(req));
    if (!session) throw new UnauthorizedError('Sessão inválida ou expirada. Faça login novamente.');
    req.auth = session;
    next();
  } catch (err) {
    next(err);
  }
};

/** Blocks the business API until a temporary password has been replaced. */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword) {
    return next(new ForbiddenError('Troque a senha temporária antes de continuar.', 'PASSWORD_CHANGE_REQUIRED'));
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.type !== 'super_admin') {
    return next(new ForbiddenError('Acesso restrito ao SuperAdmin (Conta Mãe).'));
  }
  next();
};

/**
 * Route guard by routine permission (e.g. `can('openings:create')`; several arguments = any of them). The session carries the effective
 * permissions (profile + individual exceptions), read fresh on every request, so changes apply immediately.
 * SuperAdmin holds every permission.
 */
export const can = (...anyOf: string[]): RequestHandler => {
  for (const p of anyOf) if (!isValidPermission(p)) throw new Error(`Permissão desconhecida no guard de rota: ${p}`);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (anyOf.some(p => req.auth?.permissions.includes(p))) return next();
    next(new ForbiddenError('Seu perfil não tem permissão para esta ação.'));
  };
};
