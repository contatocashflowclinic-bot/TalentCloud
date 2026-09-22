import type { Request, RequestHandler, Response } from 'express';
import { ValidationError } from './errors.js';

/** Forwards rejected promises to the error middleware (Express 4 does not do it natively). Shared by every route module. */
export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export const required = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`Campo obrigatório: ${label}`);
  return value.trim();
};
