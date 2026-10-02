import { handleApiError, verifyAdmin } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { formatTime24to12 } from '$lib/utils'
import { registrationParentUid } from '$lib/data/docIds'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { json } from '@sveltejs/kit'
import { isAllowedMeetingLink } from '$lib/helpers/meetingLink'
import type { Enrollment } from '$lib/server/classEnrollments'
import type { RequestHandler } from './$types'

import { dropStudent, enrollStudent } from '$lib/server/classEnrollments'
import { z } from 'zod'

const docId = (message: string) =>
  z
    .string()
    .min(1, message)
    .refine((id) => !id.includes('/'), { message })

const enrollmentSchema = z.object({
  // Everything else - the class's details, its instructor and the student's
  // and parent's names - is read from these two documents, not taken from the
  // caller. The family is mailed at the parent account's current address,
  // resolved from the registration id.
  classId: docId('A class is required'),
  registrationId: docId('A registration is required'),
})

export type EnrollRequestBody = z.infer<typeof enrollmentSchema>

export interface EnrollResponse {
  /** False when the enrollment stands but its confirmation email wasn't sent. */
  emailSent: boolean
}

/**
 * Emails the parent their student's class details, copying the instructor.
 * Reports failure rather than throwing: the enrollment has already been
 * written by the time this runs.
 */
async function sendEnrollmentEmail(
  registrationId: string,
  { classData, registration }: Enrollment,
): Promise<boolean> {
  try {
    const [parentEmail, instructorEmail] = await Promise.all([
      resolveAccountEmail(
        registrationParentUid(registrationId),
        'Parent',
        '/api/enroll',
      ),
      resolveAccountEmail(classData.instructorUid, 'Instructor', '/api/enroll'),
    ])
    const [class1Time, class2Time] = [
      [classData.classDay1, classData.classTime1],
      [classData.classDay2, classData.classTime2],
    ].map(([day, time]) => `${day} at ${formatTime24to12(time)}`)
    const { personal } = registration
    const studentName =
      `${personal.studentFirstName ?? ''} ${personal.studentLastName ?? ''}`.trim()
    const data = {
      subject: `${classData.course} class details for ${studentName}`,
      app: {
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        instructor: `${classData.instructorFirstName} ${classData.instructorLastName}`,
        firstName: personal.parentFirstName ?? '',
        class1Time,
        class2Time,
        // Checked when the class was saved; checked again here because the
        // link lands in a family's inbox.
        meetingLink: isAllowedMeetingLink(classData.meetingLink ?? '')
          ? classData.meetingLink
          : '',
        course: classData.course,
        instructorEmail,
        online: classData.online,
        studentName,
      },
    }
    await sendEmail({
      to: parentEmail,
      cc: instructorEmail,
      subject: data.subject,
      html: renderEmail(
        classData.online
          ? 'onlineClassEnrolledEmailTemplate'
          : 'inPersonClassEnrolledEmailTemplate',
        data,
      ),
    })
    return true
  } catch (err) {
    console.error(
      `[API /api/enroll] Enrollment email for ${registrationId} not sent:`,
      err,
    )
    return false
  }
}

/** Enrolls a student in a class, then emails the family the details. */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const { classId, registrationId } = enrollmentSchema.parse(
      await request.json(),
    )
    const enrollment = await enrollStudent(classId, registrationId)
    const emailSent = await sendEnrollmentEmail(registrationId, enrollment)
    return json({ emailSent } satisfies EnrollResponse)
  } catch (err) {
    throw handleApiError('/api/enroll', err)
  }
}

/** Drops a student from a class. Sends no email. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdmin(locals)
    const { classId, registrationId } = enrollmentSchema.parse(
      await request.json(),
    )
    await dropStudent(classId, registrationId)
    return json({ message: 'Dropped.' })
  } catch (err) {
    throw handleApiError('/api/enroll', err)
  }
}
