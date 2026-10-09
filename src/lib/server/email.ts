import { SENDGRID_API_TOKEN } from '$app/env/private'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  replyTo?: string
}

// Support for recording and retrieving emails in-memory for Cypress e2e
// tests in environments where SendGrid is not configured, like CI.
export interface SentEmail {
  to: string[]
  subject: string
  html: string
  cc?: string[]
  replyTo?: string
  timestamp: number
}

export const sentEmails: SentEmail[] = []

export function getSentEmails(): SentEmail[] {
  return sentEmails
}

export function clearSentEmails(): void {
  sentEmails.length = 0
}

function parseEmails(emails: string | string[]): string[] {
  if (Array.isArray(emails)) {
    return emails.map((e) => e.trim()).filter(Boolean)
  }
  return emails
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * Sends an email using SendGrid. If SENDGRID_API_TOKEN is not set,
 * it simulates the email send and logs a warning.
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const { to, subject, html, cc, replyTo } = options

  const toEmails = parseEmails(to)
  const toStr = toEmails.join(', ')

  if (
    !SENDGRID_API_TOKEN ||
    SENDGRID_API_TOKEN ===
      'SG.abcdefghijklmnopqrstuvwxyz.1234567890abcdefghijklmnopqrstuvwxyz'
  ) {
    const record: SentEmail = {
      to: toEmails,
      subject,
      html,
      timestamp: Date.now(),
    }
    if (cc) {
      const ccEmails = parseEmails(cc)
      if (ccEmails.length > 0) record.cc = ccEmails
    }
    if (replyTo) record.replyTo = replyTo
    sentEmails.push(record)

    console.warn("SENDGRID_API_TOKEN isn't set. Email sends are simulated.")
    console.log(`Email sent to: ${toStr} | Subject: ${subject}`)
    return
  }

  MailService.setApiKey(SENDGRID_API_TOKEN)

  const emailData: MailDataRequired = {
    from: 'donotreply@gbstem.org',
    to: toEmails,
    subject,
    html,
    replyTo: replyTo || 'contact@gbstem.org',
  }

  if (cc) {
    const ccEmails = parseEmails(cc)
    if (ccEmails.length > 0) {
      emailData.cc = ccEmails
    }
  }

  try {
    await MailService.send(emailData)
    console.log(`Email sent to: ${toStr} | Subject: ${subject}`)
  } catch (error) {
    console.error(
      `Error sending email to ${toStr} | Subject: ${subject},`,
      error,
    )
    throw error
  }
}
