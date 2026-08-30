import express, { type ErrorRequestHandler } from 'express';
import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError, SysBOUserRole, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../src/api-client.js';
import { createSysBORoutes } from '../src/routes/sysbo-routes.js';
import { getSysBODefinition } from '../src/sysbo/definitions.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const boEditView = resolve(testDirectory, '../views/pages/bo-edit.ejs');

describe('UI integration - SysBOUser delete behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the own-account Delete entry button disabled and without modal wiring', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');

    const $ = load(await renderSysBOUserEdit(currentUser, currentUser));
    const deleteButton = deleteEntryButton($);

    expect(deleteButton.length).toBe(1);
    expect(deleteButton.is('[disabled]')).toBe(true);
    expect(deleteButton.attr('data-bs-toggle')).toBeUndefined();
    expect(deleteButton.attr('data-bs-target')).toBeUndefined();
    expect(deleteButton.attr('title')).toMatch(/cannot delete your own/i);
    expect($('#deleteEntryModal').length).toBe(0);
  });

  it('renders Delete entry enabled with a confirmation modal for another SysBOUser', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const target = sysUser('other-id', SysBOUserRole.User, 'OtherUser');

    const $ = load(await renderSysBOUserEdit(currentUser, target, undefined, false, {
      targetObjectKey: 'sys-users',
      targetId: target.id,
      authorized: true,
      canExecute: true,
      requiresConfirmation: false,
      impacts: [],
    }));
    const deleteButton = deleteEntryButton($);

    expect(deleteButton.length).toBe(1);
    expect(deleteButton.is('[disabled]')).toBe(false);
    expect(deleteButton.attr('data-bs-toggle')).toBe('modal');
    expect(deleteButton.attr('data-bs-target')).toBe('#deleteEntryModal');
    expect($('#deleteEntryModal').length).toBe(1);
    expect($('#deleteEntryModal form').attr('action')).toBe(`/bo/sys-users/${target.id}/delete`);
  });

  it('always explains related-record impact, including the verified zero-impact case', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const target = sysUser('other-id', SysBOUserRole.User, 'OtherUser');

    const $ = load(await renderSysBOUserEdit(currentUser, target, undefined, false, {
      targetObjectKey: 'sys-users',
      targetId: target.id,
      authorized: true,
      canExecute: true,
      requiresConfirmation: false,
      impacts: [],
    }));

    const impactSummary = $('#deleteEntryModal [data-delete-impact-summary]');
    expect(impactSummary.length).toBe(1);
    expect(impactSummary.text()).toContain('Related-record impact');
    expect(impactSummary.text()).toContain('No related records will be affected.');
    expect(impactSummary.text()).toContain('found no records that would');
  });

  it('fails safe when delete-impact information is unavailable', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const target = sysUser('other-id', SysBOUserRole.User, 'OtherUser');

    const $ = load(await renderSysBOUserEdit(currentUser, target));

    expect($('#deleteEntryModal [data-delete-impact-summary]').text()).toContain('Impact information is unavailable.');
    expect($('#deleteEntryModal button[type="submit"]').is('[disabled]')).toBe(true);
  });

  it('shows every known delete consequence and blocks Delete when a restrictive relationship exists', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');
    const target = sysUser('other-id', SysBOUserRole.User, 'OtherUser');

    const $ = load(await renderSysBOUserEdit(currentUser, target, undefined, false, {
      targetObjectKey: 'sys-users',
      targetId: target.id,
      authorized: true,
      canExecute: false,
      requiresConfirmation: true,
      impacts: [
        {
          objectKey: 'sys-external-identities',
          objectName: 'External Identities',
          relationship: 'user',
          count: 2,
          action: 'cascade',
          confirmation: 'confirm',
        },
        {
          objectKey: 'sys-user-principals',
          objectName: 'User Principals',
          relationship: 'user',
          count: 1,
          action: 'unlink',
          confirmation: 'silent',
        },
        {
          objectKey: 'sys-invitations',
          objectName: 'Invitations',
          relationship: 'invitedBy',
          count: 3,
          action: 'set-null',
          confirmation: 'confirm',
        },
        {
          objectKey: 'sys-licenses',
          objectName: 'Licenses',
          relationship: 'owner',
          count: 1,
          action: 'restrict',
          confirmation: 'inherit',
        },
      ],
    }));

    const impactSummary = $('#deleteEntryModal [data-delete-impact-summary]');
    expect(impactSummary.find('[data-delete-impact-action="cascade"]').text()).toContain('will also be permanently deleted');
    expect(impactSummary.find('[data-delete-impact-action="unlink"]').text()).toContain('relationship link(s) will be removed');
    expect(impactSummary.find('[data-delete-impact-action="set-null"]').text()).toContain('reference(s) will be cleared');
    expect(impactSummary.find('[data-delete-impact-action="restrict"]').text()).toContain('prevent this deletion');
    expect(impactSummary.text()).toContain('Relationship: user');
    expect($('#deleteEntryModal').text()).toContain('Deletion cannot continue');
    expect($('#deleteEntryModal button[type="submit"]').is('[disabled]')).toBe(true);
  });

  it('does not render Delete entry when the current role has no delete permission', async () => {
    const currentUser = sysUser('user-id', SysBOUserRole.User, 'NormalUser');
    const target = sysUser('other-id', SysBOUserRole.User, 'OtherUser');

    const $ = load(
      await renderSysBOUserEdit(currentUser, target, {
        view: true,
        create: false,
        edit: false,
        delete: false,
      }),
    );

    expect(deleteEntryButton($).length).toBe(0);
    expect($('#deleteEntryModal').length).toBe(0);
  });

  it('does not render Delete entry on a new SysBOUser form', async () => {
    const currentUser = sysUser('admin-id', SysBOUserRole.Admin, 'Admin');

    const $ = load(await renderSysBOUserEdit(currentUser, {}, undefined, true));

    expect(deleteEntryButton($).length).toBe(0);
    expect($('#deleteEntryModal').length).toBe(0);
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
    expect(response.headers.location).toBe('/bo/sys-users');
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

async function renderSysBOUserEdit(
  currentUser: SysBOUser,
  item: Record<string, unknown>,
  permissions = {
    view: true,
    create: true,
    edit: true,
    delete: true,
  },
  isNew = false,
  deleteImpact: Record<string, unknown> | null = null,
): Promise<string> {
  return ejs.renderFile(boEditView, {
    definition: getSysBODefinition('sys-users'),
    permissions,
    currentUser,
    item,
    isNew,
    tabs: [],
    authenticationIdentities: [],
    referenceData: {},
    deletePresentation: {
      displayValue: String(item.name ?? 'entry'),
      entityLabel: 'User',
    },
    csrfToken: 'test-csrf',
    app: {
      ui: {
        allowAdminEmailVerification: true,
      },
    },
    deleteImpact,
  });
}

function deleteEntryButton($: ReturnType<typeof load>) {
  return $('button.btn-danger').filter((_index, element) =>
    $(element).text().includes('Delete entry'),
  );
}

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
