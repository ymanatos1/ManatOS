import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

import { EmailDeliveryError, type SysBOUser } from '@manatos/shared';
import { operationContext } from '@manatos/shared/node';

import { logger } from '../logging/logger.js';

export interface MailRuntimeConfiguration {
  enabled: boolean;
  host: string | undefined;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  fromAddress: string | undefined;
  fromName: string;
  tlsRejectUnauthorized: boolean;
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
    await operationContext.run('Verify SMTP connection', async (scope) => {
      scope.addContext({ host: this.mail.host, port: this.mail.port, secure: this.mail.secure });
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
    });
  }

  async sendWelcomeAndVerificationEmail(user: SysBOUser, verificationUrl?: string): Promise<void> {
    const safeName = escapeHtml(displayName(user));
    const safeUrl = verificationUrl ? escapeHtml(verificationUrl) : null;
    const textAction = verificationUrl ? `\n\nVerify your email address:\n${verificationUrl}` : '';
    const rows = `<tr><td style="padding:0 0 18px;font-size:15px;line-height:24px;color:#34445a">Hello <strong>${safeName}</strong>,</td></tr>
      <tr><td style="padding:0 0 18px;font-size:15px;line-height:24px;color:#34445a">Welcome to ManatOS. Thank you for creating your account.</td></tr>
      ${
        safeUrl
          ? `<tr><td style="padding:0 0 16px;font-size:15px;line-height:24px;color:#34445a">Please verify your email address to activate your account.</td></tr>
      <tr><td align="center" style="padding:18px 0 22px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="#1769d2" style="background-color:#1769d2;border-radius:6px"><a href="${safeUrl}" style="display:inline-block;padding:14px 28px;border-radius:6px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">Verify your email address</a></td>
      </tr></table></td></tr>
      <tr><td style="padding:12px 16px;background-color:#eff5fd;border-left:3px solid #1769d2;font-size:13px;line-height:21px;color:#415877">For your security, use this link only for the account you just created.</td></tr>
      <tr><td style="padding:22px 0 6px;font-size:13px;line-height:20px;color:#64758b">If the button does not work, copy this link into your browser:</td></tr>
      <tr><td style="padding:0 0 18px;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere"><a href="${safeUrl}" style="color:#1769d2;text-decoration:underline;word-break:break-all">${safeUrl}</a></td></tr>`
          : ''
      }
      <tr><td style="padding:0;font-size:13px;line-height:21px;color:#64758b">If you did not create a ManatOS account, you can ignore this email.</td></tr>`;
    await this.send(
      user.email,
      'ManatOS — Welcome and email verification',
      `Hello ${displayName(user)},\n\nWelcome to ManatOS. Thank you for creating your account.${textAction}\n\nIf you did not create this account, ignore this email.`,
      transactionalEmail('Welcome to ManatOS', rows),
      'welcome-verification',
      user.id,
    );
  }

  async sendPasswordResetEmail(user: SysBOUser, resetUrl: string): Promise<void> {
    // The API owns the recovery URL. Escape it for HTML attributes and visible fallback text.
    const safeUrl = escapeHtml(resetUrl);
    const safeName = escapeHtml(displayName(user));
    const text = `Hello ${displayName(user)},\n\nWe received a request to set or reset your ManatOS password.\n\nThis secure, single-use link expires in 30 minutes:\n${resetUrl}\n\nIf you did not request this, you may ignore this email.`;
    const html = transactionalEmail(
      'Set or reset your password',
      `<tr><td style="padding:0 0 18px;font-size:15px;line-height:24px;color:#34445a">Hello <strong>${safeName}</strong>,</td></tr>
      <tr><td style="padding:0 0 8px;font-size:15px;line-height:24px;color:#34445a">We received a request to set or reset your ManatOS account password.</td></tr>
      <tr><td align="center" style="padding:24px 0 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#1769D2" style="background-color:#1769d2;border-radius:6px">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;border:1px solid #1769d2;border-radius:6px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;text-decoration:none">Set or reset password</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 16px;background-color:#eff5fd;border-left:3px solid #1769d2;font-size:13px;line-height:21px;color:#415877">
        This link is valid for <strong>30 minutes</strong> and can be used only once.
      </td></tr>
      <tr><td style="padding:22px 0 6px;font-size:13px;line-height:20px;color:#64758b">If the button does not work, copy this link into your browser:</td></tr>
      <tr><td style="padding:0 0 18px;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere"><a href="${safeUrl}" style="color:#1769d2;text-decoration:underline;word-break:break-all">${safeUrl}</a></td></tr>
      <tr><td style="padding:0;font-size:13px;line-height:21px;color:#64758b">If you did not request this change, you can safely ignore this email.</td></tr>`,
    );
    await this.send(
      user.email,
      'ManatOS — Set or reset your password',
      text,
      html,
      'password-reset',
      user.id,
    );
  }

  async sendPasswordChangedEmail(user: SysBOUser): Promise<void> {
    const safeName = escapeHtml(displayName(user));
    const text = `Hello ${displayName(user)},\n\nYour ManatOS account password was updated successfully.\n\nIf you did not make this change, please use account recovery immediately.`;
    const html = transactionalEmail(
      'Your password was changed',
      `<tr><td style="padding:0 0 16px;font-size:15px;line-height:24px;color:#34445a">Hello <strong>${safeName}</strong>,</td></tr>
      <tr><td style="padding:0 0 18px;font-size:15px;line-height:24px;color:#34445a">Your ManatOS account password has been <strong>updated successfully</strong>.</td></tr>
      <tr><td style="padding:15px 18px;background-color:#edf9f2;border-left:3px solid #198754;color:#196442;font-size:14px;line-height:22px">&#10003; &nbsp; Your account password has been changed.</td></tr>
      <tr><td style="padding:22px 0 0;font-size:13px;line-height:21px;color:#64758b">If you did not make this change, please use account recovery immediately to protect your account.</td></tr>`,
    );
    await this.send(
      user.email,
      'Your password was changed',
      text,
      html,
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
    await operationContext.run(`Send ${mailType} email`, async (scope) => {
      scope.addContext({ mailType, userId, to });

      logger.info('Email delivery started', {
        mailType,
        userId,
        to,
        from: this.mail.fromAddress,
      });

      try {
        const result = await operationContext.run('Submit message to SMTP server', async () =>
          this.transporter.sendMail({
            from: { name: this.mail.fromName, address: this.mail.fromAddress! },
            to,
            subject,
            text,
            html,
          }),
        );

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
    });
  }
}

/** Table-only layout with inline styles for Outlook, Gmail and mobile email clients. */
function transactionalEmail(title: string, rows: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#edf3fa;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#edf3fa" style="border-collapse:collapse;background-color:#edf3fa">
    <tr><td align="center" style="padding:30px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;border-collapse:separate;background-color:#ffffff;border:1px solid #d7e3f0">
        <tr><td bgcolor="#173b69" style="padding:19px 26px;background-color:#173b69;color:#ffffff;font-size:22px;font-weight:bold;line-height:26px">ManatOS</td></tr>
        <tr><td style="padding:27px 28px 12px;color:#173b69;font-size:21px;line-height:27px;font-weight:bold">${escapeHtml(title)}</td></tr>
        <tr><td style="padding:2px 28px 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">${rows}</table></td></tr>
        <tr><td style="padding:17px 28px;border-top:1px solid #e5edf7;background-color:#f8fbff;font-size:12px;line-height:19px;color:#73829a">ManatOS &nbsp;&bull;&nbsp; Automated account security notification</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
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
