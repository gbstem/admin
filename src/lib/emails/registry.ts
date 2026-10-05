/**
 * Maps template name to its compiled HTML.
 *
 * The values are generated from `src/lib/emails/templates/*.mjml` by
 * `yarn email:build`; this file lists them so the set of sendable emails is
 * one greppable place. `yarn email:build --check` fails if the two disagree.
 */
import { acceptEmailTemplate } from '$lib/data/emailTemplates/acceptEmailTemplate'
import { actionEmailTemplate } from '$lib/data/emailTemplates/actionEmailTemplate'
import { classReminderEmailTemplate } from '$lib/data/emailTemplates/classReminderEmailTemplate'
import { inPersonClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate'
import { interviewCanceledEmailTemplate } from '$lib/data/emailTemplates/interviewCanceledEmailTemplate'
import { interviewMissedEmailTemplate } from '$lib/data/emailTemplates/interviewMissedEmailTemplate'
import { interviewRescheduledEmailTemplate } from '$lib/data/emailTemplates/interviewRescheduledEmailTemplate'
import { interviewScheduledEmailTemplate } from '$lib/data/emailTemplates/interviewScheduledEmailTemplate'
import { onlineClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/onlineClassEnrolledEmailTemplate'
import { rejectionEmailTemplate } from '$lib/data/emailTemplates/rejectionEmailTemplate'
import { scheduleInterviewEmailTemplate } from '$lib/data/emailTemplates/scheduleInterviewEmailTemplate'
import { subEmailTemplate } from '$lib/data/emailTemplates/subEmailTemplate'
import { teachingReminderEmailTemplate } from '$lib/data/emailTemplates/teachingReminderEmailTemplate'
import { waitlistEmailTemplate } from '$lib/data/emailTemplates/waitlistEmailTemplate'

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
