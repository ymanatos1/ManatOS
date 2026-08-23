import type { Response } from 'express';

/**
 * Standard API response envelope for successful query/read operations.
 *
 * GET endpoints normally use this form and therefore do not return
 * a success message.
 */
export interface ApiQueryResponse<T> {
  success: true;
  data: T;
}

/**
 * Standard API response envelope for successful command operations.
 *
 * Every non-GET API operation should return a human-readable confirmation
 * at the root response level.
 */
export interface ApiCommandResponse<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * Send a successful query/read response.
 */
export function sendQuery<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    data,
  } satisfies ApiQueryResponse<T>);
}

/**
 * Send a successful command response.
 *
 * POST / PUT / PATCH / DELETE operations should normally use this helper.
 */
export function sendCommand<T>(res: Response, message: string, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
  } satisfies ApiCommandResponse<T>);
}

/**
 * Standard API failure response.
 *
 * Failure responses deliberately use errorMessage rather than message.
 * This makes the root envelope semantically unambiguous:
 *
 *   query success   -> success + data
 *   command success -> success + message + data
 *   failure         -> success=false + errorMessage + error
 *
 * errorMessage mirrors error.message exactly and is ALWAYS user-safe.
 * It must never mirror AppError.message/developerMessage because that may
 * contain internal diagnostic information.
 *
 * Optional data may contain non-sensitive diagnostic state, such as
 * readiness-check results.
 */
export interface ApiFailureResponse<T = undefined> {
  success: false;

  errorMessage: string;

  error: {
    code: string;
    message: string;
    retryable: boolean;
  };

  data?: T;
}

/**
 * Send an explicitly detected non-exception failure.
 *
 * Exceptions should continue through the central Express error handler.
 */
export function sendFailure<T = undefined>(
  res: Response,
  status: number,
  code: string,
  errorMessage: string,
  retryable: boolean,
  data?: T,
) {
  return res.status(status).json({
    success: false,

    errorMessage,

    error: {
      code,
      message: errorMessage,
      retryable,
    },

    ...(data === undefined
      ? {}
      : {
          data,
        }),
  } satisfies ApiFailureResponse<T>);
}
