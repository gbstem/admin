/**
 * Maps template name to its compiled HTML.
 *
 * The values are generated from `src/lib/emails/templates/*.mjml` by
 * `yarn email:build`; this file lists them so the set of sendable emails is
 * one greppable place. `yarn email:build --check` fails if the two disagree.
 */
import { acceptEmailTemplate } from '#lib/data/emailTemplates/acceptEmailTemplate.js'
import { actionEmailTemplate } from '#lib/data/emailTemplates/actionEmailTemplate.js'
import { classReminderEmailTemplate } from '#lib/data/emailTemplates/classReminderEmailTemplate.js'
import { inPersonClassEnrolledEmailTemplate } from '#lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate.js'
import { interviewCanceledEmailTemplate } from '#lib/data/emailTemplates/interviewCanceledEmailTemplate.js'
import { interviewMissedEmailTemplate } from '#lib/data/emailTemplates/interviewMissedEmailTemplate.js'
import { interviewRescheduledEmailTemplate } from '#lib/data/emailTemplates/interviewRescheduledEmailTemplate.js'
import { interviewScheduledEmailTemplate } from '#lib/data/emailTemplates/interviewScheduledEmailTemplate.js'
import { onlineClassEnrolledEmailTemplate } from '#lib/data/emailTemplates/onlineClassEnrolledEmailTemplate.js'
import { rejectionEmailTemplate } from '#lib/data/emailTemplates/rejectionEmailTemplate.js'
import { scheduleInterviewEmailTemplate } from '#lib/data/emailTemplates/scheduleInterviewEmailTemplate.js'
import { subEmailTemplate } from '#lib/data/emailTemplates/subEmailTemplate.js'
import { teachingReminderEmailTemplate } from '#lib/data/emailTemplates/teachingReminderEmailTemplate.js'
import { waitlistEmailTemplate } from '#lib/data/emailTemplates/waitlistEmailTemplate.js'

export const EMAIL_TEMPLATES = {
  acceptEmailTemplate,
  actionEmailTemplate,
  classReminderEmailTemplate,
  inPersonClassEnrolledEmailTemplate,
  interviewCanceledEmailTemplate,
  interviewMissedEmailTemplate,
  interviewRescheduledEmailTemplate,
  interviewScheduledEmailTemplate,
  onlineClassEnrolledEmailTemplate,
  rejectionEmailTemplate,
  scheduleInterviewEmailTemplate,
  subEmailTemplate,
  teachingReminderEmailTemplate,
  waitlistEmailTemplate,
} as const

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES
