import { handleApiError, verifyAdmin } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { formatTime24to12 } from '$lib/utils'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

import { z } from 'zod'

const enrollSchema = z.object({
  // The student's address stays: students are registered under a parent
  // account and have no Auth uid of their own to resolve one from.
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  instructor: z.string().min(1, 'Instructor name is required'),
  // Resolved to the instructor's current address server-side; there is no
  // instructor address parameter.
  instructorUid: z.string().min(1, 'Instructor uid is required'),
  classTimes: z.array(z.string()).min(1, 'At least one class time is required'),
  classDays: z.array(z.string()).min(1, 'At least one class day is required'),
  course: z.string().min(1, 'Course is required'),
  studentName: z.string().min(1, 'Student name is required'),
  meetingLink: z.string().optional().default(''),
  online: z.boolean(),
})

export type EnrollRequestBody = z.infer<typeof enrollSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const body = enrollSchema.parse(await request.json())

    const instructorEmail = await resolveAccountEmail(
      body.instructorUid,
      'Instructor',
      '/api/enroll',
    )

    const classes = body.classDays.map(
      (day: string, index: number) =>
        `${day} at ${formatTime24to12(body.classTimes[index])}`,
    )
    const class1Time = classes[0]
    const class2Time = classes[1]

    const template = {
      name: 'interviewScheduled',
      data: {
        subject: `${body.course} class details for ${body.studentName}`,
        app: {
          name: 'Portal',
          link: 'https://portal.gbstem.org',
          instructor: body.instructor,
          firstName: body.firstName,
          class1Time,
          class2Time,
          meetingLink: body.meetingLink,
          course: body.course,
          instructorEmail,
          online: body.online,
          studentName: body.studentName,
        },
      },
    }

    const htmlBody = renderEmail(
      body.online
        ? 'onlineClassEnrolledEmailTemplate'
        : 'inPersonClassEnrolledEmailTemplate',
      template.data,
    )

    try {
      await sendEmail({
        to: body.email,
        cc: instructorEmail,
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
    throw handleApiError('/api/enroll', err)
  }
}
