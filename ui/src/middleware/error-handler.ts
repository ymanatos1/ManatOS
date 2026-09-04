import type { ErrorRequestHandler } from 'express';

import createError from 'http-errors';

import { AppError } from '@manatos/shared';

import { clearApiSession, isApiSessionExpiredError } from '../auth/api-session.js';

import { addSessionError } from '../errors/session-error-log.js';

import { renderPage } from '../presentation/render-page.js';

/**
 * UI error policy:
 *
 * - expired/revoked API session:
 *     clear authentication and return to sign-in;
 *
 * - AppError:
 *     keep the normal UI shell and show the application-error popup;
 *
 * - http-errors:
 *     render a full HTTP/navigation error page;
 *
 * - unexpected errors:
 *     normalize and render a 500 page.
 */
export const uiErrorHandler: ErrorRequestHandler = async (error, req, res, next) => {
  /*
   * Express identifies error-handling middleware by its four-argument
   * signature. `next` is intentionally retained even though this handler
   * terminates every error path itself.
   */
  void next;

  /**
   * API Bearer token expired/revoked/invalid.
   *
   * Do not show a technical/application error popup for this case.
   * The useful action is simply to authenticate again.
   */
  if (isApiSessionExpiredError(error)) {
    clearApiSession(req);

    res.redirect('/?auth=signin&message=session-expired');

    return;
  }

  /**
   * Normal application/domain failure.
   */
  if (error instanceof AppError) {
    const entry = addSessionError(req, error);

    await renderPage(
      res,
      'pages/home',

      {
        title: 'Home',

        applicationError: error,

        errorEntry: entry,
      },
    );

    return;
  }

  /**
   * Basic HTTP/navigation failure.
   */
  if (createError.isHttpError(error)) {
    res.status(error.status);

    await renderPage(
      res,
      'errors/http-error',

      {
        title: `${error.status} ${error.name}`,

        httpError: error,
      },
    );

    return;
  }

  /**
   * Unexpected exception.
   */
  console.error(
    '[ManatOS UI] Unexpected error:',
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : error,
  );

  const unexpected = new AppError(
    'UNEXPECTED_ERROR',
    error instanceof Error ? error.message : String(error),
    'An unexpected application error occurred.',
    true,
    {
      cause: error,
    },
  );

  addSessionError(req, unexpected);

  res.status(500);

  await renderPage(
    res,
    'errors/http-error',

    {
      title: '500 Internal Server Error',

      httpError: createError(500, 'An unexpected UI error occurred.'),
    },
  );
};
