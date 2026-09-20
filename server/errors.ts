export class AppError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária.') { super(message, 401); }
}
export class ForbiddenError extends AppError {
  constructor(message: string, code?: string) { super(message, 403, code); }
}
export class NotFoundError extends AppError {
  constructor(message: string) { super(message, 404); }
}
export class TooManyRequestsError extends AppError {
  constructor(message: string) { super(message, 429); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409); }
}

/**
 * Maps any thrown value (including Postgres errors) to an HTTP status + safe message.
 * `hideInternal` (production): unexpected errors answer a generic text, because their message can carry
 * infrastructure details (hosts, users, SQL). The real error is logged by the caller.
 */
export function toHttpError(err: unknown, hideInternal = false): { status: number; message: string; code?: string } {
  if (err instanceof AppError) return { status: err.status, message: err.message, code: err.code };

  const pgErr = err as { code?: string; constraint?: string; message?: string; status?: number; statusCode?: number } | undefined;
  switch (pgErr?.code) {
    case '23505': return { status: 409, message: 'Já existe um registro com estes dados (valor duplicado).' };
    case '23503': return { status: 400, message: 'Referência inválida: o registro relacionado não existe nesta organização.' };
    case '23502': return { status: 400, message: 'Campo obrigatório não informado.' };
    case '23514': return { status: 400, message: `Valor fora do permitido${pgErr.constraint ? ` (${pgErr.constraint})` : ''}.` };
    case '22P02':
    case '22007':
    case '22003': return { status: 400, message: 'Formato de dado inválido.' };
  }

  // Errors raised by the body parsers (malformed JSON, payload too large...) carry their own 4xx status
  const httpStatus = pgErr?.status ?? pgErr?.statusCode;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    return httpStatus === 413
      ? { status: 413, message: 'O conteúdo enviado excede o tamanho permitido.' }
      : { status: httpStatus, message: 'Requisição inválida: o conteúdo enviado não pôde ser lido.' };
  }

  return {
    status: 500,
    message: hideInternal ? 'Erro interno do servidor. Tente novamente em instantes.' : err instanceof Error ? err.message : 'Erro interno do servidor'
  };
}
