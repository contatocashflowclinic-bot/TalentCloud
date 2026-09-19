import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '../../src/types.js';
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

/** Route guard: SuperAdmin always passes; organization users need one of `roles`. */
export const allow = (...roles: UserRole[][]): RequestHandler => {
  const allowed = new Set(roles.flat());
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.role;
    if (role === 'SUPER_ADMIN' || (role && allowed.has(role))) return next();
    next(new ForbiddenError('Seu perfil não tem permissão para esta ação.'));
  };
};
