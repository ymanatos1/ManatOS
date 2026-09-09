/**
 * One diagnostic value recorded against an application operation.
 *
 * Sensitive values should already have been masked before they
 * reach this transport-neutral snapshot.
 */
export interface OperationContextValueSnapshot {
  name: string;
  value: unknown;
  sensitive: boolean;
}

/**
 * Immutable diagnostic snapshot of one semantic application
 * operation.
 *
 * Operation nodes may contain child operations, allowing us to
 * retain the complete semantic path that led to an error.
 */
export interface OperationNodeSnapshot {
  id: string;

  /**
   * Internal/developer-oriented description of the operation.
   */
  description: string;

  /**
   * Optional shorter description suitable for displaying
   * to the end user.
   */
  userDescription?: string;

  status: 'running' | 'completed' | 'failed' | 'cancelled';

  startedAt: string;

  completedAt?: string;

  /**
   * Calculated operation duration in milliseconds.
   */
  durationMs?: number;

  /**
   * Diagnostic values captured while the operation was running.
   */
  comments: OperationContextValueSnapshot[];

  /**
   * Nested semantic operations.
   */
  children: OperationNodeSnapshot[];

  /**
   * Application-specific error information when this operation
   * failed.
   */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Transport-neutral application error.
 *
 * HTTP mapping deliberately lives outside the application/service
 * layer so the same errors can later be used by different transports
 * or presentation technologies.
 */
export class AppError extends Error {
  /**
   * Optional semantic operation trace attached by OperationContext.
   */
  operationTrace?: OperationNodeSnapshot[];

  constructor(
    public readonly code: string,
    message: string,
    public readonly userMessage: string,
    public readonly retryable = false,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message, {
      cause: options?.cause,
    });

    this.name = new.target.name;
  }
}

/**
 * Requested business object/entity could not be found.
 */
export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(
      'NOT_FOUND',
      `${entity} '${id}' was not found.`,
      `The requested ${entity} could not be found.`,
    );
  }
}

/**
 * A requested operation conflicts with existing application state.
 *
 * Typical examples include:
 *
 * - duplicate user-name;
 * - duplicate email address;
 * - duplicate application name;
 * - another uniqueness constraint.
 */
export class ConflictError extends AppError {
  constructor(code: string, developerMessage: string, userMessage: string) {
    super(code, developerMessage, userMessage, false);
  }
}

/**
 * Business/application validation failure.
 */
export class ValidationAppError extends AppError {
  constructor(message: string, userMessage = message) {
    super('VALIDATION_ERROR', message, userMessage, false);
  }
}

/**
 * Authentication failure.
 *
 * The message intentionally does not disclose whether the supplied
 * email/user-name or password was the incorrect part.
 */
export class AuthenticationError extends AppError {
  constructor() {
    super(
      'INVALID_CREDENTIALS',
      'Invalid email/user-name or password.',
      'Invalid email/user-name or password.',
      true,
    );
  }
}

/**
 * No authentication credentials were supplied for a protected operation.
 */
export class AuthenticationRequiredError extends AppError {
  constructor() {
    super(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
      'Authentication is required.',
      false,
    );
  }
}

/**
 * A Bearer access token was supplied but it is malformed, expired,
 * revoked or otherwise invalid.
 */
export class InvalidAccessTokenError extends AppError {
  constructor() {
    super(
      'INVALID_ACCESS_TOKEN',
      'The supplied access token is invalid, expired or revoked.',
      'Your session is no longer valid. Please sign in again.',
      false,
    );
  }
}

/**
 * Authenticated user is not authorized to perform the requested
 * operation.
 */
export class ForbiddenAppError extends AppError {
  constructor(message = 'Forbidden.') {
    super('FORBIDDEN', message, 'You are not authorized to perform this operation.');
  }
}

/**
 * Storage/persistence operation failed.
 *
 * This remains storage-engine-neutral so it can be used by the
 * current in-memory/JSON implementation as well as future database
 * adapters.
 */
export class StorageAppError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      'STORAGE_ERROR',
      message,
      'The application could not persist the requested changes.',
      true,
      {
        cause,
      },
    );
  }
}

/**
 * Transactional email could not be delivered.
 *
 * The business operation that requested the email may already have completed;
 * callers must therefore decide whether this is fatal or a partial-success
 * warning.
 */
export class EmailDeliveryError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(
      'EMAIL_DELIVERY_FAILED',
      message,
      'The requested email could not be sent. Please try again later or contact an administrator.',
      true,
      { cause },
    );
  }
}
