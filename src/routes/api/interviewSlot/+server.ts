import { interviewSlotSchema } from '#lib/components/forms/schemas.js'
import {
  handleApiError,
  verifyAdminOrReviewer,
} from '#lib/server/apiHelpers.js'
import { isDocId } from '#lib/server/editTarget.js'
import {
  createInterviewSlot,
  createOpenInterviewSlots,
  deleteInterviewSlot,
  deleteOpenInterviewSlots,
  markInterviewSlotMissed,
  sendInterviewAssignedEmail,
  sendInterviewCanceledEmail,
  sendInterviewMissedEmail,
  sendInterviewRescheduledEmail,
  updateInterviewSlot,
  type CreateManyResult,
  type DeleteManyResult,
} from '#lib/server/interviewSlots.js'
import { interviewSchedulingWindow } from '#lib/server/interviewWindow.js'
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

// The most one grid save sends: a full-window paint is a few hundred.
const MAX_BULK = 2000

// The availability grid's save: the caller's open slots at each time.
const createManySchema = z.object({
  action: z.literal('createMany'),
  dates: z.array(instant).min(1, 'Paint at least one time').max(MAX_BULK),
  meetingLink,
})

// Un-painting on the availability grid: only the caller's open slots go.
const deleteManySchema = z.object({
  action: z.literal('deleteMany'),
  slotIds: z
    .array(docId('A timeslot is required'))
    .min(1, 'Choose at least one timeslot')
    .max(MAX_BULK),
})

export type CreateSlotRequestBody = z.infer<typeof createSchema>
export type UpdateSlotRequestBody = z.infer<typeof updateSchema>
export type MarkMissedRequestBody = z.infer<typeof markMissedSchema>
export type DeleteSlotRequestBody = z.infer<typeof deleteSchema>
export type CreateManySlotsRequestBody = z.infer<typeof createManySchema>
export type DeleteManySlotsRequestBody = z.infer<typeof deleteManySchema>
export type CreateManySlotsResponse = CreateManyResult
export type DeleteManySlotsResponse = DeleteManyResult

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
  return Response.json(body)
}

/**
 * Adds the caller's own interview slot, open or assigned to an applicant
 * (which emails them), or with `action: 'createMany'` the caller's open slots
 * at many times at once - see createOpenInterviewSlots. Admins and reviewers
 * alike: a slot made here is always the caller's own.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyAdminOrReviewer(locals)
    const raw = await request.json()
    if (raw?.action === 'createMany') {
      const { dates, meetingLink } = createManySchema.parse(raw)
      const result = await createOpenInterviewSlots(
        caller,
        dates.map((date) => new Date(date)),
        meetingLink,
        interviewSchedulingWindow(),
      )
      return Response.json(result satisfies CreateManySlotsResponse)
    }
    const body = createSchema.parse(raw)
    const slot = await createInterviewSlot(
      caller,
      { date: new Date(body.date), meetingLink: body.meetingLink },
      body.applicationId,
    )
    const emailSent = body.applicationId
      ? await sendInterviewAssignedEmail(slot)
      : true
    return Response.json({
      id: slot.id,
      emailSent,
    } satisfies CreateSlotResponse)
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
 * applicant is emailed to book again. With `action: 'deleteMany'`, deletes
 * the caller's own open slots among many and skips the rest - see
 * deleteOpenInterviewSlots.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyAdminOrReviewer(locals)
    const raw = await request.json()
    if (raw?.action === 'deleteMany') {
      const { slotIds } = deleteManySchema.parse(raw)
      const result = await deleteOpenInterviewSlots(caller, slotIds)
      return Response.json(result satisfies DeleteManySlotsResponse)
    }
    const { slotId } = deleteSchema.parse(raw)
    const canceled = await deleteInterviewSlot(caller, slotId)
    return changed('Deleted.', canceled, sendInterviewCanceledEmail)
  } catch (err) {
    throw handleApiError('/api/interviewSlot', err)
  }
}
