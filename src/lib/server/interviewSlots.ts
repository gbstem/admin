import {
  applicationsCollection,
  interviewTimesCollection,
  withSemester,
} from '$lib/data/collections'
import { interviewSlotDocId } from '$lib/data/docIds'
import type { EmailTemplateName } from '$lib/emails/registry'
import { renderEmail } from '$lib/emails/render'
import {
  canUserModifySlot,
  interviewIneligibility,
  type InterviewIneligibility,
} from '$lib/helpers/setInterviewTimes'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { sendEmail } from '$lib/server/email'
import { adminDb } from '$lib/server/firebase'
import { accountName } from '$lib/server/userProfile'
import { GBSTEM_TIME_ZONE, formatDateLocal } from '$lib/utils'
import { toDate } from '$lib/shared/timestamps'
import { error } from '@sveltejs/kit'

/**
 * Interview slots as admins and reviewers manage them, written only here
 * with the Admin SDK. firestore.rules gives no client write access to
 * `instructorInterviewTimes` or `applications`: applicants book through
 * portal's /api/interview, and admin's `/api/interviewSlot` calls into this
 * module.
 *
 * A booked slot and its applicant's `meta.interview` flag change together, in
 * one transaction, so an application never shows an interview that has no
 * slot, and no slot books someone whose application doesn't know.
 */

export interface SlotCaller {
  uid: string
  role: Data.Role
}

export interface NewSlot {
  date: Date
  meetingLink: string
}

/** A slot as stored, with `date` still a `Date`. */
export type StoredSlot = Omit<Data.InterviewSlot, 'date'> & { date: Date }

const slotRef = (slotId: string) =>
  adminDb.doc(`${interviewTimesCollection}/${slotId}`)
const applicationRef = (applicationId: string) =>
  adminDb.doc(`${applicationsCollection}/${applicationId}`)

const ineligibleMessages: Record<InterviewIneligibility, string> = {
  unsubmitted: 'That applicant has not submitted their application.',
  scheduled: 'That applicant already has an interview.',
  decided: 'That applicant already has a decision.',
}

function requireCanModify(
  slot: Pick<Data.InterviewSlot, 'interviewerUid'>,
  caller: SlotCaller,
) {
  if (!canUserModifySlot(slot, caller.uid, caller.role)) {
    throw error(
      403,
      'This interview does not belong to you and you are not an admin!',
    )
  }
}

/**
 * Creates the caller's own slot at `date`, open for booking, or - with
 * `applicationId` - already assigned to that applicant.
 *
 * The slot's id is its time plus the caller's uid, so adding the same time
 * again replaces the caller's slot; that is refused (409) once the slot is
 * booked, as it would drop the booking. Assigning is refused when the
 * application is missing (404), or when its applicant doesn't need an
 * interview (409): unsubmitted, already interviewing, or already decided -
 * see interviewIneligibility. Nobody on the slot is named by the request: the interviewer is the
 * caller, under the name on their own profile (400 if they have none), and
 * the interviewee's uid and name come from the application.
 */
export async function createInterviewSlot(
  caller: SlotCaller,
  { date, meetingLink }: NewSlot,
  applicationId?: string,
): Promise<StoredSlot> {
  const interviewerName = await accountName(caller.uid)
  if (!interviewerName) {
    throw error(400, 'Add your name on your profile before adding timeslots.')
  }
  const id = interviewSlotDocId(date.toISOString(), caller.uid)
  const ref = slotRef(id)
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.exists && existing.data()?.intervieweeId) {
      throw error(409, 'You already have a booked interview at that time.')
    }

    let interviewee = { id: '', firstName: '', lastName: '' }
    const appRef = applicationId ? applicationRef(applicationId) : null
    if (appRef) {
      const appSnap = await transaction.get(appRef)
      if (!appSnap.exists) {
        throw error(404, 'That application no longer exists.')
      }
      const application = appSnap.data() as Data.Application<'server'>
      const ineligible = interviewIneligibility(application.meta)
      if (ineligible) {
        throw error(409, ineligibleMessages[ineligible])
      }
      interviewee = {
        id: application.meta.uid || appRef.id,
        firstName: application.personal?.firstName ?? '',
        lastName: application.personal?.lastName ?? '',
      }
    }

    const slot: StoredSlot = {
      id,
      date,
      meetingLink,
      interviewerName,
      interviewerUid: caller.uid,
      intervieweeId: interviewee.id,
      intervieweeFirstName: interviewee.firstName,
      intervieweeLastName: interviewee.lastName,
      interviewSlotStatus: appRef ? 'pending' : 'available',
    }
    transaction.set(ref, withSemester(slot))
    if (appRef) {
      transaction.update(appRef, { 'meta.interview': true })
    }
    return slot
  })
}

/** A slot document as read, its `date` still in whatever shape it was stored. */
type ReadSlot = Omit<Data.InterviewSlot, 'date'> & { date: unknown }

/** `slot` as stored, under `id`, with its `date` as a `Date`. */
const storedSlot = (id: string, slot: ReadSlot): StoredSlot => ({
  ...slot,
  id,
  date: toDate(slot.date),
})

/** Whether an applicant holds `slot`: booked, and not yet marked missed. */
const isBooked = (
  slot: Pick<Data.InterviewSlot, 'intervieweeId' | 'interviewSlotStatus'>,
) => !!slot.intervieweeId && slot.interviewSlotStatus !== 'missed'

/** A booked slot whose date or link an edit changed, for its applicant's email. */
export interface RescheduledSlot {
  slot: StoredSlot
  /** Set when the time moved; absent when only the link changed. */
  previousDate?: Date
}

/**
 * Changes a slot's date and meeting link, the two fields the edit card
 * offers, leaving any booking on it alone. Refused for a slot that is gone
 * (404) or belongs to someone else, unless the caller is an admin (403), and
 * for a missed one (409), which stays as the record of what was booked.
 *
 * Resolves to the updated slot when it is booked and the edit changed
 * something its applicant needs to know - see sendInterviewRescheduledEmail -
 * and to null otherwise.
 */
export async function updateInterviewSlot(
  caller: SlotCaller,
  slotId: string,
  { date, meetingLink }: NewSlot,
): Promise<RescheduledSlot | null> {
  const ref = slotRef(slotId)
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      throw error(404, 'That timeslot no longer exists.')
    }
    const slot = snap.data() as ReadSlot
    requireCanModify(slot, caller)
    if (slot.interviewSlotStatus === 'missed') {
      throw error(409, 'A missed interview can no longer be edited.')
    }
    transaction.update(ref, withSemester({ date, meetingLink }))

    const previousDate = toDate(slot.date)
    const moved = previousDate.getTime() !== date.getTime()
    if (!isBooked(slot) || (!moved && slot.meetingLink === meetingLink)) {
      return null
    }
    return {
      slot: { ...storedSlot(slotId, slot), date, meetingLink },
      ...(moved ? { previousDate } : {}),
    }
  })
}

/**
 * Deletes a slot, clearing its applicant's `meta.interview` flag when it was
 * booked - otherwise the flag stays `true` with no slot behind it, which
 * hides the applicant from the eligible-interviewee list and the time-request
 * queue with no way to reschedule them. A `missed` slot already cleared the
 * flag, and its applicant may have been booked again since, so deleting one
 * leaves the flag alone.
 *
 * The applicant's application may itself be gone (account deletion), so it is
 * read first and only updated if it exists: the slot stays deletable either
 * way. Deleting a slot that is already gone succeeds.
 *
 * Resolves to the deleted slot when it was booked and its application is
 * still there, for sendInterviewCanceledEmail, and to null otherwise.
 */
export async function deleteInterviewSlot(
  caller: SlotCaller,
  slotId: string,
): Promise<StoredSlot | null> {
  const ref = slotRef(slotId)
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) return null
    const slot = snap.data() as ReadSlot
    requireCanModify(slot, caller)
    const appRef = isBooked(slot) ? applicationRef(slot.intervieweeId) : null
    const appSnap = appRef ? await transaction.get(appRef) : null
    transaction.delete(ref)
    if (appRef && appSnap?.exists) {
      transaction.update(appRef, { 'meta.interview': false })
      return storedSlot(slotId, slot)
    }
    return null
  })
}

/**
 * Records that a booked slot's interview didn't happen, whichever side missed
 * it, and frees its applicant to be scheduled again: the slot becomes
 * `missed`, keeping its interviewee as the record of what was booked, and
 * the application's `meta.interview` is cleared in the same transaction. The
 * applicant's open time requests then list again and portal offers them the
 * booking form.
 *
 * `missedBy` records which side it was - the effect is the same, though
 * sendInterviewMissedEmail words the applicant's email by it. Allowed for the
 * slot's interviewer or an admin (403 otherwise). Refused for a slot that is
 * gone (404), not booked, or still to come (409).
 *
 * Resolves to the missed slot when its application is still there, for that
 * email, and to null otherwise.
 */
export async function markInterviewSlotMissed(
  caller: SlotCaller,
  slotId: string,
  missedBy: Data.InterviewMissedBy,
  now: Date = new Date(),
): Promise<StoredSlot | null> {
  const ref = slotRef(slotId)
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      throw error(404, 'That timeslot no longer exists.')
    }
    const slot = snap.data() as ReadSlot
    requireCanModify(slot, caller)
    if (slot.interviewSlotStatus !== 'pending' || !slot.intervieweeId) {
      throw error(409, 'Only a booked interview can be marked missed.')
    }
    if (toDate(slot.date) > now) {
      throw error(
        409,
        'That interview has not started yet. Delete it to cancel it instead.',
      )
    }
    const appRef = applicationRef(slot.intervieweeId)
    const appSnap = await transaction.get(appRef)
    transaction.update(ref, { interviewSlotStatus: 'missed', missedBy })
    if (!appSnap.exists) return null
    transaction.update(appRef, { 'meta.interview': false })
    return {
      ...storedSlot(slotId, slot),
      interviewSlotStatus: 'missed',
      missedBy,
    }
  })
}

const EMAIL_ROUTE = '/api/interviewSlot'
const PORTAL = { name: 'Portal', link: 'https://portal.gbstem.org' }

/**
 * Emails `slot`'s applicant about it, copying its interviewer, with replies
 * going to the interviewer. Both addresses are resolved from Auth by uid.
 * `interview` adds to the fields every interview template shares. Resolves to
 * whether it went out rather than throwing: the slot is already written.
 */
async function emailInterviewee(
  slot: StoredSlot,
  template: EmailTemplateName,
  subject: string,
  interview: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const [intervieweeEmail, interviewerEmail] = await Promise.all([
      resolveAccountEmail(slot.intervieweeId, 'Interviewee', EMAIL_ROUTE),
      resolveAccountEmail(slot.interviewerUid, 'Interviewer', EMAIL_ROUTE),
    ])
    await sendEmail({
      to: intervieweeEmail,
      cc: interviewerEmail,
      replyTo: interviewerEmail,
      subject,
      html: renderEmail(template, {
        subject,
        app: PORTAL,
        interview: {
          interviewee: slot.intervieweeFirstName,
          name: slot.interviewerName,
          date: formatDateLocal(slot.date, GBSTEM_TIME_ZONE),
          ...interview,
        },
      }),
    })
    return true
  } catch (err) {
    console.error(
      `[API ${EMAIL_ROUTE}] ${template} for ${slot.id} not sent:`,
      err,
    )
    return false
  }
}

/** Emails an applicant that an interviewer assigned them `slot`. */
export function sendInterviewAssignedEmail(slot: StoredSlot): Promise<boolean> {
  return emailInterviewee(
    slot,
    'interviewScheduledEmailTemplate',
    `${slot.intervieweeFirstName}, your interview with ${slot.interviewerName} has been scheduled`,
    { link: slot.meetingLink },
  )
}

/** Emails an applicant the new time or link of their booked slot. */
export function sendInterviewRescheduledEmail({
  slot,
  previousDate,
}: RescheduledSlot): Promise<boolean> {
  return emailInterviewee(
    slot,
    'interviewRescheduledEmailTemplate',
    `${slot.intervieweeFirstName}, your interview with ${slot.interviewerName} has been ${previousDate ? 'rescheduled' : 'updated'}`,
    {
      link: slot.meetingLink,
      previousDate:
        previousDate && formatDateLocal(previousDate, GBSTEM_TIME_ZONE),
    },
  )
}

/** Emails an applicant that their booked slot was deleted, to book again. */
export function sendInterviewCanceledEmail(slot: StoredSlot): Promise<boolean> {
  return emailInterviewee(
    slot,
    'interviewCanceledEmailTemplate',
    `${slot.intervieweeFirstName}, your interview with ${slot.interviewerName} has been canceled`,
  )
}

/**
 * Emails an applicant that their interview was missed - saying by whom, with
 * an apology when it was the interviewer - and to book again.
 */
export function sendInterviewMissedEmail(slot: StoredSlot): Promise<boolean> {
  return emailInterviewee(
    slot,
    'interviewMissedEmailTemplate',
    `${slot.intervieweeFirstName}, your interview with ${slot.interviewerName} was missed`,
    { interviewerMissed: slot.missedBy === 'interviewer' },
  )
}
