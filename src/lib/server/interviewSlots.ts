import {
  applicationsCollection,
  interviewTimesCollection,
  withSemester,
} from '$lib/data/collections'
import { interviewSlotDocId } from '$lib/data/docIds'
import { renderEmail } from '$lib/emails/render'
import { canUserModifySlot } from '$lib/helpers/setInterviewTimes'
import { resolveAccountEmail } from '$lib/server/accountEmail'
import { sendEmail } from '$lib/server/email'
import { adminDb } from '$lib/server/firebase'
import { accountName } from '$lib/server/userProfile'
import { GBSTEM_TIME_ZONE, formatDateLocal } from '$lib/utils'
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
 * application is missing (404), unsubmitted or already has an interview
 * (409). Nobody on the slot is named by the request: the interviewer is the
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
      if (!application.meta?.submitted || application.meta?.interview) {
        throw error(
          409,
          'That applicant already has an interview, or has not submitted their application.',
        )
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

/**
 * Changes a slot's date and meeting link, the two fields the edit card
 * offers, leaving any booking on it alone. Refused for a slot that is gone
 * (404) or belongs to someone else, unless the caller is an admin (403).
 */
export async function updateInterviewSlot(
  caller: SlotCaller,
  slotId: string,
  { date, meetingLink }: NewSlot,
): Promise<void> {
  const ref = slotRef(slotId)
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      throw error(404, 'That timeslot no longer exists.')
    }
    requireCanModify(snap.data() as Data.InterviewSlot, caller)
    transaction.update(ref, withSemester({ date, meetingLink }))
  })
}

/**
 * Deletes a slot, clearing its applicant's `meta.interview` flag when it was
 * booked - otherwise the flag stays `true` with no slot behind it, which
 * hides the applicant from the eligible-interviewee list and the time-request
 * queue with no way to reschedule them.
 *
 * The applicant's application may itself be gone (account deletion), so it is
 * read first and only updated if it exists: the slot stays deletable either
 * way. Deleting a slot that is already gone succeeds.
 */
export async function deleteInterviewSlot(
  caller: SlotCaller,
  slotId: string,
): Promise<void> {
  const ref = slotRef(slotId)
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) return
    const slot = snap.data() as Data.InterviewSlot
    requireCanModify(slot, caller)
    const appRef = slot.intervieweeId
      ? applicationRef(slot.intervieweeId)
      : null
    const appSnap = appRef ? await transaction.get(appRef) : null
    transaction.delete(ref)
    if (appRef && appSnap?.exists) {
      transaction.update(appRef, { 'meta.interview': false })
    }
  })
}

/**
 * Emails an applicant that an interviewer assigned them `slot`, copying the
 * interviewer. Both addresses are resolved from Auth by uid. Resolves to
 * whether it went out rather than throwing: the slot is already written.
 */
export async function sendInterviewAssignedEmail(
  slot: StoredSlot,
): Promise<boolean> {
  const route = '/api/interviewSlot'
  try {
    const [intervieweeEmail, interviewerEmail] = await Promise.all([
      resolveAccountEmail(slot.intervieweeId, 'Interviewee', route),
      resolveAccountEmail(slot.interviewerUid, 'Interviewer', route),
    ])
    const subject = `${slot.intervieweeFirstName}, your interview with ${slot.interviewerName} has been scheduled`
    await sendEmail({
      to: intervieweeEmail,
      cc: interviewerEmail,
      replyTo: interviewerEmail,
      subject,
      html: renderEmail('interviewScheduledEmailTemplate', {
        subject,
        app: { name: 'Portal', link: 'https://portal.gbstem.org' },
        interview: {
          interviewee: slot.intervieweeFirstName,
          name: slot.interviewerName,
          date: formatDateLocal(slot.date, GBSTEM_TIME_ZONE),
          link: slot.meetingLink,
        },
      }),
    })
    return true
  } catch (err) {
    console.error(
      `[API ${route}] Assignment email for ${slot.id} not sent:`,
      err,
    )
    return false
  }
}
