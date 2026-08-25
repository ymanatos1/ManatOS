import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

import { EmailDeliveryError, type SysUser } from '@manatos/shared';

import { config } from '../config.js';
import { logger } from '../logging/logger.js';

/** Server-side application mail boundary. */
export interface IEmailService {
  verifyConnection(): Promise<void>;
  sendWelcomeAndVerificationEmail(user: SysUser, verificationUrl?: string): Promise<void>;
  sendPasswordResetEmail(user: SysUser, resetUrl: string): Promise<void>;
  sendPasswordChangedEmail(user: SysUser): Promise<void>;
}

class DisabledEmailService implements IEmailService {
  async verifyConnection(): Promise<void> {
    logger.warn('Email delivery is disabled', { mailEnabled: false });
  }

  async sendWelcomeAndVerificationEmail(): Promise<void> {
    throw new EmailDeliveryError('Email delivery is disabled by configuration.');
  }

  async sendPasswordResetEmail(): Promise<void> {
    throw new EmailDeliveryError('Email delivery is disabled by configuration.');
  }

  async sendPasswordChangedEmail(): Promise<void> {
    throw new EmailDeliveryError('Email delivery is disabled by configuration.');
  }
}

class SmtpEmailService implements IEmailService {
  private readonly transporter: Transporter;

  constructor() {
    const transportOptions: SMTPTransport.Options = {
      host: config.SMTP_HOST!,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: {
        user: config.SMTP_USER!,
        pass: config.SMTP_PASSWORD!,
      },
      tls: {
        rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED,
      },
    };

    this.transporter = nodemailer.createTransport(transportOptions);

    logger.info('SMTP transport created', {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      tlsRejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED,
      fromAddress: config.MAIL_FROM_ADDRESS,
    });
  }

  async verifyConnection(): Promise<void> {
    logger.info('Verifying SMTP connection', {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
    });

    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified', {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
      });
    } catch (error) {
      logger.error('SMTP connection verification failed', { error });
      throw new EmailDeliveryError('SMTP connection verification failed.', error);
    }
  }

  async sendWelcomeAndVerificationEmail(user: SysUser, verificationUrl?: string): Promise<void> {
    const action = verificationUrl
      ? `<p><a href="${escapeHtml(verificationUrl)}">Verify your email address</a></p>`
      : '';
    const textAction = verificationUrl ? `\n\nVerify your email address:\n${verificationUrl}` : '';

    await this.send(
      user.email,
      'Welcome to ManatOS',
      `Welcome to ManatOS, ${displayName(user)}.${textAction}`,
      `<p>Welcome to ManatOS, <strong>${escapeHtml(displayName(user))}</strong>.</p>${action}`,
      'welcome-verification',
      user.id,
    );
  }

  async sendPasswordResetEmail(user: SysUser, resetUrl: string): Promise<void> {
    await this.send(
      user.email,
      'Set or reset your ManatOS password',
      `A request was made to set or reset your ManatOS password.\n\nContinue here:\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
      `<p>A request was made to set or reset your ManatOS password.</p><p><a href="${escapeHtml(resetUrl)}">Set or reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
      'password-reset',
      user.id,
    );
  }

  async sendPasswordChangedEmail(user: SysUser): Promise<void> {
    await this.send(
      user.email,
      'Your ManatOS password was changed',
      'Your ManatOS password was changed. If this was not you, use account recovery immediately.',
      '<p>Your ManatOS password was changed.</p><p>If this was not you, use account recovery immediately.</p>',
      'password-changed',
      user.id,
    );
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
    mailType: string,
    userId: string,
  ): Promise<void> {
    logger.info('Email delivery started', {
      mailType,
      userId,
      to,
      from: config.MAIL_FROM_ADDRESS,
    });

    try {
      const result = await this.transporter.sendMail({
        from: { name: config.MAIL_FROM_NAME, address: config.MAIL_FROM_ADDRESS! },
        to,
        subject,
        text,
        html,
      });

      logger.info('Email delivered to SMTP server', {
        mailType,
        userId,
        to,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        response: result.response,
      });
    } catch (error) {
      logger.error('Email delivery failed', {
        mailType,
        userId,
        to,
        from: config.MAIL_FROM_ADDRESS,
        error,
      });

      throw new EmailDeliveryError(`Failed to send '${mailType}' email to '${to}'.`, error);
    }
  }
}

function displayName(user: SysUser): string {
  return user.firstName?.trim() || user.name;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createEmailService(): IEmailService {
  if (!config.MAIL_ENABLED) return new DisabledEmailService();

  try {
    return new SmtpEmailService();
  } catch (error) {
    logger.error('Failed to initialize SMTP email service', { error });
    return new DisabledEmailService();
  }
}
