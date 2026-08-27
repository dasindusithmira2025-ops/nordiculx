import 'server-only';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isProduction } from '@/lib/env';

/**
 * Transactional email.
 *
 * Two drivers, chosen by `MAIL_DRIVER`:
 *
 *   log   development default. Writes the message to the server log and sends
 *         nothing. `src/lib/env.ts` rejects it in production.
 *   smtp  a real server. Locally that is Mailpit on :1025, which accepts
 *         everything and shows it at http://localhost:8025, so no mail ever
 *         leaves the machine in development.
 *
 * Sending NEVER throws into the caller. A confirmation email failing must not
 * roll back an order the customer has already paid for — the order is the
 * record, the email is a courtesy. Failures are logged loudly instead.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain text is required; HTML is optional and additive. */
  text: string;
  html?: string;
  replyTo?: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (env.MAIL_DRIVER !== 'smtp') return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 1025,
    secure: env.SMTP_SECURE,
    // Mailpit accepts unauthenticated connections; real servers will not.
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export type SendResult = { sent: boolean; reason?: string };

export async function sendMail(message: MailMessage): Promise<SendResult> {
  if (env.MAIL_DRIVER === 'log') {
    // Deliberately not the message body in full — an email can contain an
    // address and an order's contents, and logs are not a private store.
    console.warn(
      `[mail:log] to=${message.to} subject="${message.subject}" (${message.text.length} chars, not sent)`,
    );
    return { sent: false, reason: 'log driver' };
  }

  const transport = getTransporter();
  if (!transport) return { sent: false, reason: 'no transport configured' };

  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    });
    return { sent: true };
  } catch (error) {
    // Loud, but not fatal. See the note at the top of this file.
    console.error(
      `[mail] failed to send "${message.subject}" to ${message.to}:`,
      error instanceof Error ? error.message : error,
    );
    return { sent: false, reason: 'send failed' };
  }
}

/** Whether mail is actually deliverable. Surfaced on the admin health page. */
export const mailIsDeliverable = env.MAIL_DRIVER === 'smtp';

/** True when the current configuration would be rejected in production. */
export const mailRequiresConfiguration = !isProduction && !mailIsDeliverable;
