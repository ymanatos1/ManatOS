import type { ErrorRequestHandler } from 'express';

import { AppError } from '@manatos/shared';

import { config } from '../config.js';
import { logger } from '../logging/logger.js';

/**
 * Maps application-level error codes to their HTTP representation.
 *
 * AppError itself deliberately remains HTTP-neutral.
 *
 * This mapping therefore belongs here, at the HTTP transport boundary.
 */
const httpStatusByErrorCode: Record<string, number> = {
  VALIDATION_ERROR: 400,

  INVALID_CREDENTIALS: 401,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_ACCESS_TOKEN: 401,

  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ADMIN_EMAIL_VERIFICATION_DISABLED: 403,

  NOT_FOUND: 404,

  DUPLICATE_BO_VALUE: 409,

  SELF_PARENT_NOT_ALLOWED: 409,
  EXTERNAL_IDENTITY_EXISTS: 409,

  STORAGE_ERROR: 503,
  EMAIL_DELIVERY_FAILED: 503,
};

/**
 * Central Express API error handler.
 *
 * Every API error is normalized into the same JSON envelope.
 *
 * Diagnostic information returned to the caller depends on:
 *
 *   API_ERROR_DETAIL_LEVEL
 *
 * Expected modes:
 *
 *   normal
 *     User-safe error information only.
 *
 *   operations
 *     User-safe information plus semantic operation trace.
 *
 *   full
 *     Full development diagnostics including developer message,
 *     JavaScript stack and semantic operation trace.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  /**
   * Convert unexpected/native exceptions into our standard AppError.
   */
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          'UNEXPECTED_ERROR',

          error instanceof Error ? error.message : String(error),

          'An unexpected server error occurred.',

          true,

          {
            cause: error,
          },
        );

  const detailLevel = config.API_ERROR_DETAIL_LEVEL;

  const httpStatus = httpStatusByErrorCode[appError.code] ?? 500;

  const logFields = {
    method: req.method,
    path: req.originalUrl,
    statusCode: httpStatus,
    errorCode: appError.code,
    retryable: appError.retryable,
    developerMessage: appError.message,
    ...(appError.operationTrace?.[0]?.id
      ? { operationId: appError.operationTrace[0].id }
      : {}),
  };

  // Expected client/business/security rejections are warnings. Operational
  // server/infrastructure failures remain errors. The full operationTrace is
  // still returned in API responses according to API_ERROR_DETAIL_LEVEL.
  if (httpStatus >= 500) logger.error('API request failed', logFields);
  else logger.warn('API request rejected', logFields);

  res.status(httpStatus).json({
    success: false,

    /**
     * Global user-facing failure message.
     *
     * This mirrors error.message and is deliberately distinct from the
     * success-only command property named message.
     */
    errorCode: appError.code,

    errorMessage: appError.userMessage,

    error: {
      code: appError.code,

      /**
       * Kept inside error as well so the error object remains
       * independently meaningful and existing clients are not broken.
       */
      message: appError.userMessage,

      retryable: appError.retryable,

      ...(detailLevel === 'full'
        ? {
            developerMessage: appError.message,

            stack: appError.stack,
          }
        : {}),

      ...(detailLevel === 'operations' || detailLevel === 'full'
        ? {
            operationTrace: appError.operationTrace,
          }
        : {}),
    },
  });
};
