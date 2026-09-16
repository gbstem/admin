import { handleApiError, verifyAdmin } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { registrationParentUid } from '$lib/data/docIds'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { resolveCoInstructorEmails } from '$lib/server/instructorDirectory'
import { renderEmail } from '$lib/emails/render'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const remindStudentsSchema = z.object({
  // The registration to write about, not an address: the family is mailed at
  // the parent account's current address, resolved from the registration's
  // id. The address stored on the registration is only an audit record.
  registrationId: z.string().min(1, 'Registration id is required'),
  // Resolved to current addresses server-side (see instructorDirectory.ts)
  // rather than sent by the client, so a cc always reaches the account's
  // current address and a client can't dictate the recipient list.
  otherInstructorUids: z.array(z.string()).default([]),
  name: z.string().min(1, 'Name is required'),
  class: z.string().min(1, 'Class is required'),
  classTime: z.string().min(1, 'Class time is required'),
  instructorName: z.string().min(1, 'Instructor name is required'),
})

export type RemindStudentsRequestBody = z.infer<typeof remindStudentsSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const body = remindStudentsSchema.parse(await request.json())

    const [email, otherEmails] = await Promise.all([
      resolveAccountEmail(
        registrationParentUid(body.registrationId),
        'Parent',
        '/api/remindStudents',
      ),
      resolveCoInstructorEmails(body.otherInstructorUids),
    ])

    const template = {
      name: 'classReminder',
      data: {
        subject: 'gbSTEM Class Reminder',
        app: {
          firstName: body.name,
          name: 'Portal',
          class: body.class,
          classTime: body.classTime,
          instructor: body.instructorName,
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('classReminderEmailTemplate', template.data)

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
    throw handleApiError('/api/remindStudents', err)
  }
}
