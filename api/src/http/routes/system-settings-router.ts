import { Router } from 'express';

import { SysBOUserRole, ValidationAppError } from '@manatos/shared';

import { requireAdmin, requireAuthenticated, requireRole } from '../../auth/auth-middleware.js';
import { relationalTargetOperations } from '../../storage/adapters/relational/target-operations.js';
import { runStorageOperation } from '../../storage/execution-context.js';
import type { SystemSettingsStore } from '../../system-settings.js';
import { sendCommand, sendQuery } from '../response.js';

/** Infrastructure/bootstrap settings: Superuser may inspect; Admin may mutate. */
export function createSystemSettingsRouter(settings: SystemSettingsStore) {
  const router = Router();
  router.use(requireAuthenticated);

  router.get('/storage', requireRole(SysBOUserRole.Admin, SysBOUserRole.Superuser), (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, settings.adminStorageSnapshot());
  });

  router.use(requireAdmin);

  router.post('/storage/configurations', async (req, res) => {
    const item = await settings.addStorageConfiguration(req.body ?? {});
    sendCommand(res, 'Storage configuration added successfully.', { item, restartRequired: true });
  });

  router.patch('/storage/configurations/order', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const configurations = await settings.setStorageConfigurationOrder(ids);
    sendCommand(res, 'Storage configuration order updated.', { configurations });
  });

  router.delete('/storage/configurations/:id', async (req, res) => {
    const item = await settings.deleteStorageConfiguration(String(req.params.id ?? ''));
    sendCommand(res, 'Storage configuration deleted successfully.', { item });
  });

  router.patch('/storage/configurations/:id', async (req, res) => {
    const item = await settings.updateStorageConfiguration(
      String(req.params.id ?? ''),
      req.body ?? {},
    );
    sendCommand(res, 'Storage configuration updated successfully.', {
      item,
      restartRequired: true,
    });
  });

  router.patch('/storage/configurations/:id/order', async (req, res) => {
    const direction = String(req.body?.direction ?? '');
    if (direction !== 'up' && direction !== 'down') {
      throw new ValidationAppError("Storage configuration order direction must be 'up' or 'down'.");
    }
    const configurations = await settings.moveStorageConfiguration(
      String(req.params.id ?? ''),
      direction,
    );
    sendCommand(res, 'Storage configuration order updated.', { configurations });
  });

  router.patch('/storage/current', async (req, res) => {
    await settings.selectStorageConfiguration(String(req.body?.configurationId ?? ''));
    const snapshot = settings.adminStorageSnapshot();
    sendCommand(res, 'Storage configuration selected for the next API start.', {
      selectedConfigurationId: snapshot.selectedConfigurationId,
      runningConfigurationId: snapshot.runningConfigurationId,
      restartRequired: snapshot.selectedConfigurationId !== snapshot.runningConfigurationId,
    });
  });

  router.patch('/storage/debugging', async (req, res) => {
    const debugging = await settings.updateStorageDebugging({
      apiStorageContextEnabled: req.body?.apiStorageContextEnabled === true,
      outputDirectory:
        typeof req.body?.outputDirectory === 'string' ? req.body.outputDirectory : undefined,
    });
    sendCommand(res, 'Storage debugging settings updated.', { debugging });
  });

  const target = (body: Record<string, unknown>) => {
    const configuration = settings.operationalStorageConfiguration({
      configurationId: typeof body.configurationId === 'string' ? body.configurationId : undefined,
      adapterId: typeof body.adapterId === 'string' ? body.adapterId : undefined,
      settings:
        body.settings && typeof body.settings === 'object'
          ? (body.settings as Record<string, unknown>)
          : undefined,
    });
    const operations = relationalTargetOperations(configuration.adapterId);
    if (!operations) {
      throw new ValidationAppError(
        'This storage adapter does not expose database-target operations.',
      );
    }
    return { configuration, operations };
  };

  router.post('/storage/target/test-connection', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const result = await runStorageOperation(
      configuration.adapterId,
      'target test connection',
      () => operations.testConnection(configuration.settings),
    );
    if (result.ok === true) {
      settings.recordVerifiedStorageTarget(configuration, 'connection');
    }
    sendQuery(res, result);
  });

  router.post('/storage/target/databases', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const databases = await runStorageOperation(
      configuration.adapterId,
      'target list databases',
      () => operations.listDatabases(configuration.settings),
    );
    // A successful catalog listing verifies only the selected database, not
    // arbitrary names a browser may later submit during the Save operation.
    const selectedDatabase = configuration.settings.database;
    if (selectedDatabase) {
      const found = databases.find(
        (name) => name.localeCompare(selectedDatabase, undefined, { sensitivity: 'accent' }) === 0,
      );
      if (found) {
        settings.recordVerifiedStorageTarget(configuration, 'database', found);
      }
    }
    sendQuery(res, { databases });
  });

  router.post('/storage/target/database/inspect', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const database = String(req.body?.database ?? configuration.settings.database ?? '');
    const inspection = await runStorageOperation(
      configuration.adapterId,
      'target inspect database',
      () => operations.inspectDatabase(configuration.settings, database),
    );
    if (
      inspection.exists &&
      inspection.database.localeCompare(database, undefined, { sensitivity: 'accent' }) === 0
    ) {
      settings.recordVerifiedStorageTarget(configuration, 'database', inspection.database);
    }
    sendQuery(res, inspection);
  });

  router.post('/storage/target/database/prepare', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const database = String(req.body?.database ?? configuration.settings.database ?? '');
    const result = await runStorageOperation(
      configuration.adapterId,
      'target prepare database',
      () => operations.prepareDatabase(configuration.settings, database),
    );
    if (result.exists) {
      settings.recordVerifiedStorageTarget(configuration, 'database', result.database);
    }
    sendCommand(res, `Database '${result.database}' is available.`, result);
  });

  router.post('/storage/target/schema/inspect', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const database = String(req.body?.database ?? configuration.settings.database ?? '');
    const inspection = await runStorageOperation(
      configuration.adapterId,
      'target inspect schema',
      () => operations.inspectSchema(configuration.settings, database),
    );
    if (inspection.ready) {
      settings.recordVerifiedStorageTarget(configuration, 'schema', database);
    }
    sendQuery(res, inspection);
  });

  router.post('/storage/target/schema/prepare', async (req, res) => {
    const { configuration, operations } = target(req.body ?? {});
    const database = String(req.body?.database ?? configuration.settings.database ?? '');
    const result = await runStorageOperation(configuration.adapterId, 'target prepare schema', () =>
      operations.prepareSchema(configuration.settings, database),
    );
    if (result.ready) {
      settings.recordVerifiedStorageTarget(configuration, 'schema', database);
    }
    sendCommand(
      res,
      result.ready
        ? `Database '${result.database}' is ready for the current ManatOS relational schema.`
        : `Schema preparation for '${result.database}' completed with remaining differences.`,
      result,
    );
  });

  return router;
}
