import { describe, expect, it } from 'vitest';

import { AppError, operationContext } from '@manatos/shared';

describe('API semantic error tracing', () => {
  it('keeps one request root and the complete failed semantic branch', async () => {
    let captured: AppError | undefined;

    await operationContext.runRequest('operation-trace-test', async () => {
      operationContext.beginRequestOperation(
        'PUT /api/v1/SysApplications/:id',
        'Processing API request',
      );

      try {
        await operationContext.runRoot('Update Application', async () =>
          operationContext.run('Persist Application', async () => {
            throw new Error('disk write failed');
          }),
        );
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError(
                'UNEXPECTED_ERROR',
                error instanceof Error ? error.message : String(error),
                'An unexpected server error occurred.',
                true,
                { cause: error },
              );

        captured = operationContext.attachCurrentTrace(appError);
      } finally {
        operationContext.completeRequestOperation();
      }
    });

    expect(captured?.operationTrace).toHaveLength(1);
    const request = captured?.operationTrace?.[0];
    expect(request?.description).toBe('PUT /api/v1/SysApplications/:id');
    expect(request?.children).toHaveLength(1);
    expect(request?.children[0]?.description).toBe('Update Application');
    expect(request?.children[0]?.children[0]?.description).toBe('Persist Application');
    expect(request?.children[0]?.children[0]?.errorMessage).toBe('disk write failed');
  });
});
