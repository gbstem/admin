import { interviewSlotSchema } from '$lib/components/forms/schemas'
import {
  handleApiError,
  verifyAdmin,
  verifyAdminOrReviewer,
} from '$lib/server/apiHelpers'
import { isDocId } from '$lib/server/editTarget'
import {
  createInterviewSlot,
  deleteInterviewSlot,
  markInterviewSlotMissed,
  sendInterviewAssignedEmail,
  sendInterviewCanceledEmail,
  sendInterviewMissedEmail,
  sendInterviewRescheduledEmail,
  updateInterviewSlot,
} from '$lib/server/interviewSlots'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// An instant, not the form's local date-time string: the server's time zone
// isn't the interviewer's, so the browser converts before sending.
const instant = z.string().datetime({ message: 'A date and time is required' })
const docId = (message: string) => z.string().refine(isDocId, message)
const { meetingLink } = interviewSlotSchema.shape

const createSchema = z.object({
  date: instant,
  meetingLink,
  // The application to assign the slot to straight away. The interviewee's
  // uid and name are read from it; the interviewer is the caller, named
  // from their own profile.
  applicationId: docId('An application is required').optional(),
})

const updateSchema = z.object({
  slotId: docId('A timeslot is required'),
  date: instant,
  meetingLink,
})

// Either side may have missed it; the slot records which.
const markMissedSchema = z.object({
  action: z.literal('markMissed'),
  slotId: docId('A timeslot is required'),
  missedBy: z.enum(['interviewer', 'interviewee']),
})

const deleteSchema = z.object({ slotId: docId('A timeslot is required') })

export type CreateSlotRequestBody = z.infer<typeof createSchema>
export type UpdateSlotRequestBody = z.infer<typeof updateSchema>
export type MarkMissedRequestBody = z.infer<typeof markMissedSchema>
export type DeleteSlotRequestBody = z.infer<typeof deleteSchema>

export interface CreateSlotResponse {
  id: string
  /** False when an assigned slot stands but its email wasn't sent. */
  emailSent: boolean
}

export interface ChangeSlotResponse {
  message: string
  /**
   * Whether the applicant's email about the change went out; absent when the
   * change emailed nobody - an open slot, or an edit that kept the time and
   * link.
   */
  emailSent?: boolean
}

/** A change's response, emailing its applicant when `booked` is set. */
async function changed<T>(
  message: string,
  booked: T | null,
  send: (booked: T) => Promise<boolean>,
): Promise<Response> {
  const body: ChangeSlotResponse = { message }
  if (booked) body.emailSent = await send(booked)
  return json(body)
}

/**
 * Adds the caller's own interview slot. Admins and reviewers may add open
 * slots; assigning one to an applicant, which emails them, is admin-only.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = createSchema.parse(await request.json())
    const caller = body.applicationId
      ? verifyAdmin(locals)
      : verifyAdminOrReviewer(locals)
    const slot = await createInterviewSlot(
      caller,
      { date: new Date(body.date), meetingLink: body.meetingLink },
      body.applicationId,
    )
    const emailSent = body.applicationId
      ? await sendInterviewAssignedEmail(slot)
      : true
    return json({ id: slot.id, emailSent } satisfies CreateSlotResponse)
  } catch (err) {
    throw handleApiError('/api/interviewSlot', err)
  }
}

/**
 * Changes a slot's date and link, or with `action: 'markMissed'` records that
 * its interview didn't happen: the caller's own slot, or any for an admin.
 * Either way a booked slot's applicant is emailed about it.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyAdminOrReviewer(locals)
    const body = await request.json()
    if (body?.action === 'markMissed') {
      const { slotId, missedBy } = markMissedSchema.parse(body)
      const missed = await markInterviewSlotMissed(caller, slotId, missedBy)
      return changed('Marked missed.', missed, sendInterviewMissedEmail)
    }
    const { slotId, date, meetingLink } = updateSchema.parse(body)
    const rescheduled = await updateInterviewSlot(caller, slotId, {
      date: new Date(date),
      meetingLink,
    })
    return changed('Updated.', rescheduled, sendInterviewRescheduledEmail)
  } catch (err) {
    throw handleApiError('/api/interviewSlot', err)
  }
}

/**
 * Deletes a slot: the caller's own, or any for an admin. A booked slot's
 * applicant is emailed to book again.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyAdminOrReviewer(locals)
    const { slotId } = deleteSchema.parse(await request.json())
    const canceled = await deleteInterviewSlot(caller, slotId)
    return changed('Deleted.', canceled, sendInterviewCanceledEmail)
  } catch (err) {
    throw handleApiError('/api/interviewSlot', err)
  }
}
