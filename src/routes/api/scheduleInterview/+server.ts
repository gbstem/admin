import { handleApiError, verifyAdminOrReviewer } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

import { z } from 'zod'

// `applicantUid` is the application document's id. The applicant's current
// address is resolved from Auth; the one they typed on their application goes
// stale the moment they change their account email, so it is not accepted.
const scheduleInterviewSchema = z.object({
  applicantUid: z.string().min(1, 'Applicant uid is required'),
  name: z.string().min(1, 'Name is required'),
  deadline: z.string().optional().default(''),
})

export type ScheduleInterviewRequestBody = z.infer<
  typeof scheduleInterviewSchema
>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const body = scheduleInterviewSchema.parse(await request.json())

    const intervieweeEmail = await resolveAccountEmail(
      body.applicantUid,
      'Applicant',
      '/api/scheduleInterview',
    )

    const template = {
      name: 'scheduleInterview',
      data: {
        subject: 'Please schedule your gbSTEM instructor interview',
        app: {
          firstName: body.name,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
          deadline: body.deadline,
        },
      },
    }

    const htmlBody = renderEmail(
      'scheduleInterviewEmailTemplate',
      template.data,
    )

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
    throw handleApiError('/api/scheduleInterview', err)
  }
}
