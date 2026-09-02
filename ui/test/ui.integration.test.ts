import express, { type ErrorRequestHandler } from 'express';

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError, SysBOUserRole, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../src/api-client.js';
import { createSysBORoutes } from '../src/routes/sysbo-routes.js';

describe('UI integration - SysBOUser delete behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a manually posted own-account delete before calling the API', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const deleteSpy = vi.spyOn(apiClient, 'delete');

    const response = await request(routeHarness(currentUser))
      .post(`/sys-users/${currentUser.id}/delete`)
      .type('form')
      .send({ _csrf: 'test-csrf' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('allows an Admin UI route to delete another SysBOUser and redirects to the list', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      success: true,
      message: 'Deleted.',
      data: { id: 'other-id' },
    });

    const response = await request(routeHarness(currentUser))
      .post('/sys-users/other-id/delete')
      .type('form')
      .send({ _csrf: 'test-csrf' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/bo/sys-users');
    expect(deleteSpy).toHaveBeenCalledWith('/api/v1/SysUsers/other-id', {
      accessToken: 'test-api-token',
    });
  });

  it('rejects a non-Admin UI delete route before calling the API', async () => {
    const currentUser = sysUser('user-id', SysBOUserRole.User, 'NormalUser');
    const deleteSpy = vi.spyOn(apiClient, 'delete');

    const response = await request(routeHarness(currentUser))
      .post('/sys-users/other-id/delete')
      .type('form')
      .send({ _csrf: 'test-csrf' });

    expect(response.status).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('allows a Guest to save their own SysBOUser entry through the UI route', async () => {
    const currentUser = sysUser('guest-id', SysBOUserRole.Guest, 'GuestUser');
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      success: true,
      message: 'Updated.',
      data: { ...currentUser, firstName: 'Guest' },
    });

    const response = await request(routeHarness(currentUser))
      .post('/sys-users/save')
      .type('form')
      .send({
        _csrf: 'test-csrf',
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        firstName: 'Guest',
        enabled: 'on',
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/bo/sys-users/${currentUser.id}`);
    expect(patchSpy).toHaveBeenCalledWith(
      `/api/v1/SysUsers/${currentUser.id}`,
      expect.any(Object),
      { accessToken: 'test-api-token' },
    );
  });

  it('still rejects a Guest saving another SysBOUser entry', async () => {
    const currentUser = sysUser('guest-id', SysBOUserRole.Guest, 'GuestUser');
    const patchSpy = vi.spyOn(apiClient, 'patch');

    const response = await request(routeHarness(currentUser))
      .post('/sys-users/save')
      .type('form')
      .send({
        _csrf: 'test-csrf',
        id: 'other-id',
        name: 'OtherUser',
        email: 'other@example.test',
        role: SysBOUserRole.User,
      });

    expect(response.status).toBe(403);
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('rejects a delete request with an invalid CSRF token before calling the API', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const deleteSpy = vi.spyOn(apiClient, 'delete');

    const response = await request(routeHarness(currentUser))
      .post('/sys-users/other-id/delete')
      .type('form')
      .send({ _csrf: 'wrong-token' });

    expect(response.status).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

function routeHarness(currentUser: SysBOUser) {
  const app = express();

  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    (req as typeof req & { session: Record<string, unknown> }).session = {
      userId: currentUser.id,
      apiAccessToken: 'test-api-token',
      apiSessionId: 'test-api-session',
      apiExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      csrfToken: 'test-csrf',
    };

    res.locals.currentUser = currentUser;

    next();
  });

  app.use(createSysBORoutes());

  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);

      return;
    }
    if (error instanceof AppError) {
      res.status(error.code === 'FORBIDDEN' ? 403 : 500).json({
        code: error.code,
        message: error.userMessage,
      });

      return;
    }

    const status = typeof error?.status === 'number' ? error.status : 500;

    res.status(status).json({
      message: error instanceof Error ? error.message : String(error),
    });
  };

  app.use(errorHandler);

  return app;
}

function sysUser(id: string, role: SysBOUserRole, name: string): SysBOUser {
  return {
    id,
    name,
    email: `${name.toLowerCase()}@example.test`,
    emailVerified: true,
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    emailVerificationSource: 'internal',
    passwordHash: null,
    passwordChangedAt: null,
    role,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'System',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'System',
  };
}
