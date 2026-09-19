import { handleApiError, verifyAdminOrReviewer } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import semesterDatesJson from '$lib/data/semesterDates.json'

import { z } from 'zod'

// `applicantUid` is the application document's id. The applicant's current
// address is resolved from Auth; the one they typed on their application goes
// stale the moment they change their account email, so it is not accepted.
const decisionSchema = z.object({
  applicantUid: z.string().min(1, 'Applicant uid is required'),
  decision: z.enum(['rejected', 'waitlisted', 'substitute', 'accepted']),
  name: z.string().min(1, 'Name is required'),
})

export type DecisionRequestBody = z.infer<typeof decisionSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const body = decisionSchema.parse(await request.json())

    const intervieweeEmail = await resolveAccountEmail(
      body.applicantUid,
      'Applicant',
      '/api/decision',
    )
    const decision = body.decision

    const template = {
      name: 'decision',
      data: {
        subject: 'gbSTEM Instructor Decision',
        app: {
          firstName: body.name,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
          orientation: semesterDatesJson.instructorOrientation,
          orientationLink: semesterDatesJson.instructorOrientationLink,
        },
      },
    }

    let htmlBody
    switch (decision) {
      case 'rejected':
        htmlBody = renderEmail('rejectionEmailTemplate', template.data)
        break
      case 'waitlisted':
        htmlBody = renderEmail('waitlistEmailTemplate', template.data)
        break
      case 'substitute':
        htmlBody = renderEmail('subEmailTemplate', template.data)
        break
      case 'accepted':
        htmlBody = renderEmail('acceptEmailTemplate', template.data)
        break
      default:
        htmlBody = renderEmail('waitlistEmailTemplate', template.data)
    }

    try {
      await sendEmail({
        to: intervieweeEmail,
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/decision', err)
  }
}
