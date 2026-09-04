import { sysBOApplicationsMetadata, type SysBOApplication } from '@manatos/shared';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { GenericSysBOService } from './generic-sysbo-service.js';

/**
 * Application service for managed applications.
 *
 * No additional domain rules are currently required beyond the
 * generic SysBO behavior.
 */
export class SysBOApplicationService extends GenericSysBOService<SysBOApplication> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysApplications, sysBOApplicationsMetadata);
  }
}
