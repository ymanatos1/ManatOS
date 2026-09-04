import { Router } from 'express';
import { NotFoundError } from '@manatos/shared';

import type { IEmailService } from '../../email/email-service.js';
import type { SysBOUserService } from '../../services/sys-user-service.js';
import { sendCommand } from '../api-response.js';

/** Trusted UI -> API mail commands. */
export function createInternalEmailRouter(users: SysBOUserService, email: IEmailService) {
  const router = Router();

  router.post('/verification', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysBOUser', String(req.body?.userId ?? ''));

    const verificationUrl = req.body?.verificationUrl
      ? String(req.body.verificationUrl)
      : undefined;

    await email.sendWelcomeAndVerificationEmail(user, verificationUrl);
    sendCommand(res, 'Verification email sent successfully.', null);
  });

  router.post('/password-reset', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysBOUser', String(req.body?.userId ?? ''));

    await email.sendPasswordResetEmail(user, String(req.body?.resetUrl ?? ''));
    sendCommand(res, 'Password reset email sent successfully.', null);
  });

  router.post('/password-changed', async (req, res) => {
    const user = await users.get(String(req.body?.userId ?? ''));
    if (!user) throw new NotFoundError('SysBOUser', String(req.body?.userId ?? ''));

    await email.sendPasswordChangedEmail(user);
    sendCommand(res, 'Password change notification sent successfully.', null);
  });

  return router;
}
