import type { SysBOUser } from '@manatos/shared';

import { apiClient } from '../api/client.js';

/**
 * UI-side mail gateway.
 *
 * This class does NOT send mail and contains no SMTP configuration.
 * It asks the trusted API to perform server-side delivery.
 */
export interface IEmailService {
  sendWelcomeAndVerificationEmail(user: SysBOUser, url?: string): Promise<void>;
  sendPasswordChangedEmail(user: SysBOUser): Promise<void>;
  sendPasswordResetEmail(user: SysBOUser, url: string): Promise<void>;
}

class ApiEmailService implements IEmailService {
  async sendWelcomeAndVerificationEmail(user: SysBOUser, url?: string): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/verification',
      {
        userId: user.id,
        ...(url ? { verificationUrl: url } : {}),
      },
      { internal: true },
    );
  }

  async sendPasswordResetEmail(user: SysBOUser, url: string): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/password-reset',
      { userId: user.id, resetUrl: url },
      { internal: true },
    );
  }

  async sendPasswordChangedEmail(user: SysBOUser): Promise<void> {
    await apiClient.post(
      '/api/v1/internal/email/password-changed',
      { userId: user.id },
      { internal: true },
    );
  }
}

export const emailService: IEmailService = new ApiEmailService();
