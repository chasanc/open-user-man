export type AppErrorKind =
  | 'not_found'
  | 'already_exists'
  | 'invalid'
  | 'unauthenticated'
  | 'permission_denied'
  | 'failed_precondition';

/** One error type for both transports: REST maps kind to an HTTP status, gRPC to a status code. */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} not found`);
export const exists = (message: string) => new AppError('already_exists', message);
export const invalid = (message: string) => new AppError('invalid', message);
export const unauthenticated = (message = 'Invalid credentials') =>
  new AppError('unauthenticated', message);
export const denied = (message: string) => new AppError('permission_denied', message);
export const precondition = (message: string) => new AppError('failed_precondition', message);
