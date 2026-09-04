import { Router } from 'express';

import { authenticatedAuditActor } from '../../audit/audit-service.js';
import { requireAdmin, requireAuthenticated } from '../../auth/auth-middleware.js';
import type {
  SaveStoredSysBOExtAuthProviderInput,
  SaveVerifiedSysBOExtAuthProviderInput,
  SysBOExtAuthProviderService,
} from '../../services/sys-ext-auth-provider-service.js';
import { sendCommand } from '../api-response.js';

/**
 * Trusted external-provider credential operations.
 *
 * The parent /api/v1/internal router owns the internal API-key boundary. Routes
 * that mutate or reveal credential material additionally require an Admin
 * Bearer session.
 */
export function createInternalExternalAuthProviderRouter(service: SysBOExtAuthProviderService) {
  const router = Router();

  router.get('/runtime', async (_req, res) => {
    const items = await service.resolveConfiguredProviders();
    res.json({ success: true, data: { items } });
  });

  router.post('/verified-credentials', requireAuthenticated, requireAdmin, async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await service.saveVerifiedCredentials(
      req.body as SaveVerifiedSysBOExtAuthProviderInput,
      actor,
    );

    sendCommand(
      res,
      `External authentication credentials for '${item.name}' verified and saved successfully.`,
      {
        id: item.id,
        provider: item.provider,
        credentialsVerified: item.credentialsVerified,
        credentialsVerifiedAt: item.credentialsVerifiedAt,
      },
    );
  });

  router.post('/stored-credentials', requireAuthenticated, requireAdmin, async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await service.saveStoredCredentials(
      req.body as SaveStoredSysBOExtAuthProviderInput,
      actor,
    );

    sendCommand(
      res,
      `External authentication credentials for '${item.name}' stored securely; verification is still required.`,
      {
        id: item.id,
        provider: item.provider,
        credentialsVerified: item.credentialsVerified,
        credentialsVerifiedAt: item.credentialsVerifiedAt,
      },
    );
  });

  router.get('/:id/credentials-for-test', requireAuthenticated, requireAdmin, async (req, res) => {
    const data = await service.storedCredentialMaterial(String(req.params.id ?? ''));
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  });

  router.post('/:id/credentials-verified', requireAuthenticated, requireAdmin, async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await service.markStoredCredentialsVerified(
      String(req.params.id ?? ''),
      String(req.body.clientId ?? ''),
      String(req.body.secretUpdatedAt ?? ''),
      actor,
    );

    sendCommand(
      res,
      `External authentication credentials for '${item.name}' verified successfully.`,
      {
        id: item.id,
        provider: item.provider,
        credentialsVerified: item.credentialsVerified,
        credentialsVerifiedAt: item.credentialsVerifiedAt,
      },
    );
  });

  router.delete('/:id/credentials', requireAuthenticated, requireAdmin, async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await service.removeCredentials(String(req.params.id ?? ''), actor);

    sendCommand(
      res,
      `External authentication credentials for '${item.name}' removed; provider disabled.`,
      { id: item.id, provider: item.provider, enabled: item.enabled },
    );
  });

  return router;
}
