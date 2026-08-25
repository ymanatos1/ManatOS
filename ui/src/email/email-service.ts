import type { SysUser } from '@manatos/shared';

import { apiClient } from '../api-client.js';

/**
 * UI-side mail gateway.
 *
 * This class does NOT send mail and contains no SMTP configuration.
 * It asks the trusted API to perform server-side delivery.
 */
export interface IEmailService {
  sendWelcomeAndVerificationEmail(user: SysUser, url?: string): Promise<void>;
  sendPasswordChangedEmail(user: SysUser): Promise<void>;
  sendPasswordResetEmail(user: SysUser, url: string): Promise<void>;
}

class ApiEmailService implements IEmailService {
  async sendWelcomeAndVerificationEmail(user: SysUser, url?: string): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/verification',
      {
        userId: user.id,
        ...(url ? { verificationUrl: url } : {}),
      },
      { internal: true },
    );
  }

  async sendPasswordResetEmail(user: SysUser, url: string): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/password-reset',
      { userId: user.id, resetUrl: url },
      { internal: true },
    );
  }

  async sendPasswordChangedEmail(user: SysUser): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/password-changed',
      { userId: user.id },
      { internal: true },
    );
  }
}

export const emailService: IEmailService = new ApiEmailService();
