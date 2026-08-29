import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

import { EmailDeliveryError, type SysBOUser } from '@manatos/shared';

import { logger } from '../logging/logger.js';

export interface MailRuntimeConfiguration {
  enabled:boolean; host:string | undefined; port:number; secure:boolean; user:string | undefined; password:string | undefined;
  fromAddress:string | undefined; fromName:string; tlsRejectUnauthorized:boolean;
}

/** Server-side application mail boundary. */
export interface IEmailService {
  verifyConnection(): Promise<void>;
  sendWelcomeAndVerificationEmail(user: SysBOUser, verificationUrl?: string): Promise<void>;
  sendPasswordResetEmail(user: SysBOUser, resetUrl: string): Promise<void>;
  sendPasswordChangedEmail(user: SysBOUser): Promise<void>;
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

  constructor(private readonly mail: MailRuntimeConfiguration) {
    const transportOptions: SMTPTransport.Options = {
      host: this.mail.host!,
      port: this.mail.port,
      secure: this.mail.secure,
      auth: {
        user: this.mail.user!,
        pass: this.mail.password!,
      },
      tls: {
        rejectUnauthorized: this.mail.tlsRejectUnauthorized,
      },
    };

    this.transporter = nodemailer.createTransport(transportOptions);

    logger.info('SMTP transport created', {
      host: this.mail.host,
      port: this.mail.port,
      secure: this.mail.secure,
      tlsRejectUnauthorized: this.mail.tlsRejectUnauthorized,
      fromAddress: this.mail.fromAddress,
    });
  }

  async verifyConnection(): Promise<void> {
    logger.info('Verifying SMTP connection', {
      host: this.mail.host,
      port: this.mail.port,
    });

    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified', {
        host: this.mail.host,
        port: this.mail.port,
        secure: this.mail.secure,
      });
    } catch (error) {
      logger.error('SMTP connection verification failed', { error });
      throw new EmailDeliveryError('SMTP connection verification failed.', error);
    }
  }

  async sendWelcomeAndVerificationEmail(user: SysBOUser, verificationUrl?: string): Promise<void> {
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

  async sendPasswordResetEmail(user: SysBOUser, resetUrl: string): Promise<void> {
    await this.send(
      user.email,
      'Set or reset your password',
      `A request was made to set or reset your password.\n\nContinue here:\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
      `<p>A request was made to set or reset your password.</p><p><a href="${escapeHtml(resetUrl)}">Set or reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
      'password-reset',
      user.id,
    );
  }

  async sendPasswordChangedEmail(user: SysBOUser): Promise<void> {
    await this.send(
      user.email,
      'Your password was changed',
      'Your password was changed. If this was not you, use account recovery immediately.',
      '<p>Your password was changed.</p><p>If this was not you, use account recovery immediately.</p>',
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
      from: this.mail.fromAddress,
    });

    try {
      const result = await this.transporter.sendMail({
        from: { name: this.mail.fromName, address: this.mail.fromAddress! },
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
        from: this.mail.fromAddress,
        error,
      });

      throw new EmailDeliveryError(`Failed to send '${mailType}' email to '${to}'.`, error);
    }
  }
}

function displayName(user: SysBOUser): string {
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

export function createEmailService(mail: MailRuntimeConfiguration): IEmailService {
  if (!mail.enabled) return new DisabledEmailService();

  try {
    return new SmtpEmailService(mail);
  } catch (error) {
    logger.error('Failed to initialize SMTP email service', { error });
    return new DisabledEmailService();
  }
}
