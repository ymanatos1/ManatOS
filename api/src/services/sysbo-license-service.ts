import {
  ConflictError,
  MANATOS_COMPANY,
  NotFoundError,
  resolvePlatform,
  sysBOLicensesMetadata,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysBOLicense,
} from '@manatos/shared';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { GenericSysBOService } from './generic-sysbo-service.js';
import type { AuditActor } from '../audit/audit-service.js';

/**
 * Application service for customer/application licenses.
 */
export class SysBOLicenseService extends GenericSysBOService<SysBOLicense> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysLicenses, sysBOLicensesMetadata);
  }

  /**
   * Create a Company-owned license for exactly one known platform.
   *
   * `applicationId` is deliberately optional: omitting it creates a
   * platform-wide entitlement. When supplied today it is valid only for a
   * platform that contributes SysBOApplication (currently protoCRM).
   */
  override async create(
    input: SysBOCreateInput<SysBOLicense>,
    actor: AuditActor,
  ): Promise<SysBOLicense> {
    const principal = await this.store.sysPrincipals.getById(input.principalId);

    if (!principal) {
      throw new NotFoundError('SysBOPrincipal', input.principalId);
    }

    const platform = resolvePlatform(MANATOS_COMPANY, input.platformId);
    if (platform.id !== input.platformId) {
      throw new NotFoundError('Platform', input.platformId);
    }

    if (input.applicationId) {
      if (!platform.entities.some((entity) => entity.sysBOKey === 'sys-applications')) {
        throw new ConflictError(
          'PLATFORM_APPLICATIONS_UNAVAILABLE',
          'Application restriction is unavailable for this platform.',
          `Platform '${platform.name}' does not provide applications.`,
        );
      }

      const application = await this.store.sysApplications.getById(input.applicationId);
      if (!application) {
        throw new NotFoundError('SysBOApplication', input.applicationId);
      }
    }

    return super.create(input, actor);
  }

  /**
   * Revalidate platform/application references when either side of the
   * license scope changes. This keeps PATCH/PUT behavior consistent with
   * creation and prevents an invalid cross-platform restriction.
   */
  override async update(
    id: string,
    changes: SysBOUpdateInput<SysBOLicense>,
    actor: AuditActor,
  ): Promise<SysBOLicense> {
    const existing = await this.get(id);
    if (!existing) {
      throw new NotFoundError('SysBOLicense', id);
    }

    const platformId = changes.platformId ?? existing.platformId;
    const applicationId = changes.applicationId !== undefined
      ? changes.applicationId
      : existing.applicationId;

    const platform = resolvePlatform(MANATOS_COMPANY, platformId);
    if (platform.id !== platformId) {
      throw new NotFoundError('Platform', platformId);
    }

    if (applicationId) {
      if (!platform.entities.some((entity) => entity.sysBOKey === 'sys-applications')) {
        throw new ConflictError(
          'PLATFORM_APPLICATIONS_UNAVAILABLE',
          'Application restriction is unavailable for this platform.',
          `Platform '${platform.name}' does not provide applications.`,
        );
      }

      const application = await this.store.sysApplications.getById(applicationId);
      if (!application) {
        throw new NotFoundError('SysBOApplication', applicationId);
      }
    }

    return super.update(id, changes, actor);
  }
}
