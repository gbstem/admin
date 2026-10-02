import semesterDatesJson from '$lib/data/semesterDates.json'
import { renderEmail } from '$lib/emails/render'
import { calculateInterviewDeadline } from '$lib/helpers/application'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import type { DecidedApplicant } from '$lib/server/applicationDecisions'
import { sendEmail } from '$lib/server/email'
import {
  GBSTEM_TIME_ZONE,
  formatDateInGbstemTime,
  parseGbstemDateTime,
} from '$lib/utils'

const ROUTE = '/api/decision'

const DECISION_TEMPLATES = {
  rejected: 'rejectionEmailTemplate',
  waitlisted: 'waitlistEmailTemplate',
  substitute: 'subEmailTemplate',
  accepted: 'acceptEmailTemplate',
} as const

/**
 * Emails one applicant their decision: an invitation to schedule an interview
 * for `interview`, the outcome otherwise. Sent to the account's current
 * address, resolved from the application id (the applicant's uid), never to
 * the one typed on the application.
 *
 * Resolves to whether it went out rather than throwing: the decision is
 * already recorded by the time this runs. An applicant with no first name on
 * file gets no email, since every template addresses them by it.
 */
export async function sendDecisionEmail(
  { applicationId, firstName }: DecidedApplicant,
  decision: Data.Decision,
  now = new Date(),
): Promise<boolean> {
  try {
    if (!firstName) {
      throw new Error('the application has no first name')
    }
    const to = await resolveAccountEmail(applicationId, 'Applicant', ROUTE)
    const app = { firstName, name: 'Portal', link: 'https://portal.gbstem.org' }
    const orientation = parseGbstemDateTime(
      semesterDatesJson.instructorOrientation,
      semesterDatesJson.instructorOrientationTime,
    )
    if (decision === 'interview') {
      const subject = 'Please schedule your gbSTEM instructor interview'
      await sendEmail({
        to,
        subject,
        html: renderEmail('scheduleInterviewEmailTemplate', {
          subject,
          app: {
            ...app,
            deadline: calculateInterviewDeadline(
              now,
              orientation,
              GBSTEM_TIME_ZONE,
            ),
          },
        }),
      })
    } else {
      const subject = 'gbSTEM Instructor Decision'
      await sendEmail({
        to,
        subject,
        html: renderEmail(DECISION_TEMPLATES[decision], {
          subject,
          app: {
            ...app,
            orientation: formatDateInGbstemTime(orientation, 'long'),
            orientationLink: semesterDatesJson.instructorOrientationLink,
          },
        }),
      })
    }
    return true
  } catch (err) {
    console.error(
      `[API ${ROUTE}] ${decision} email for ${applicationId} not sent:`,
      err,
    )
    return false
  }
}
