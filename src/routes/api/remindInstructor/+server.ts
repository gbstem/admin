import { handleApiError, verifyAdmin } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { resolveCoInstructorEmails } from '$lib/server/instructorDirectory'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { renderEmail } from '$lib/emails/render'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const remindInstructorSchema = z.object({
  instructorUid: z.string().min(1, 'Instructor uid is required'),
  // Resolved to current addresses server-side (see instructorDirectory.ts)
  // rather than sent by the client, so a cc always reaches the account's
  // current address and a client can't dictate the recipient list.
  otherInstructorUids: z.array(z.string()).default([]),
  name: z.string().min(1, 'Name is required'),
  class: z.string().min(1, 'Class is required'),
  classTime: z.string().min(1, 'Class time is required'),
})

export type RemindInstructorRequestBody = z.infer<typeof remindInstructorSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const body = remindInstructorSchema.parse(await request.json())

    const email = await resolveAccountEmail(
      body.instructorUid,
      'Instructor',
      '/api/remindInstructor',
    )

    const otherEmails = await resolveCoInstructorEmails(
      body.otherInstructorUids,
    )

    const template = {
      name: 'teachingReminder',
      data: {
        subject: 'gbSTEM Class Teaching Reminder',
        app: {
          firstName: body.name,
          name: 'Portal',
          class: body.class,
          classTime: body.classTime,
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('teachingReminderEmailTemplate', template.data)

    try {
      await sendEmail({
        to: email,
        cc: otherEmails,
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
    throw handleApiError('/api/remindInstructor', err)
  }
}
