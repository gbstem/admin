import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  interviewTimesCollection,
  withSemester,
} from '$lib/data/collections'
import {
  buildAssignInterviewApiPayload,
  filterEligibleInterviewees,
  generateInterviewSlotId,
  parseInterviewSlotDoc,
  parseSlotRequestDoc,
  sortSlotRequestsByDate,
} from '$lib/helpers/setInterviewTimes'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

/**
 * Service providing Data Access Layer for Interview Slots and Slot Requests.
 */
export const interviewService = {
  /**
   * Fetches all interview slots from Firestore.
   */
  async fetchInterviewSlots(): Promise<Data.InterviewSlot[]> {
    const interviewSlots: Data.InterviewSlot[] = []
    const q = query(collection(db, interviewTimesCollection))
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((docSnap) => {
      const slot = parseInterviewSlotDoc(docSnap.id, docSnap.data())
      if (slot) {
        interviewSlots.push(slot)
      }
    })
    return interviewSlots
  },

  /**
   * Fetches all slot requests from Firestore sorted by date.
   */
  async fetchSlotRequests(): Promise<Data.SlotRequest[]> {
    const slotRequests: Data.SlotRequest[] = []
    const q = query(collection(db, 'interviewTimeRequests'))
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((docSnap) => {
      const req = parseSlotRequestDoc(docSnap.id, docSnap.data())
      if (req) {
        slotRequests.push(req)
      }
    })
    return sortSlotRequestsByDate(slotRequests)
  },

  /**
   * Fetches all applicant options eligible for interviews.
   */
  async fetchEligibleInterviewees(): Promise<{
    names: { name: string }[]
    options: Data.Application<'client'>[]
  }> {
    const q = query(collection(db, applicationsCollection))
    const querySnapshot = await getDocs(q)
    return filterEligibleInterviewees(querySnapshot.docs)
  },

  /**
   * Creates or assigns an interview slot in Firestore and calls API if assigned.
   *
   * An assigned slot and its applicant's `meta.interview` flag are written in
   * one batch, so an application never shows an interview that has no slot or
   * a slot books someone whose application doesn't know. Portal's
   * /api/interview books the same pair in a transaction.
   */
  async createOrAssignInterviewSlot(
    slotToAdd: Data.InterviewSlot,
    selectedIntervieweeDocId?: string,
    userUid?: string,
  ): Promise<Data.InterviewSlot> {
    const slotId = generateInterviewSlotId(slotToAdd.date, userUid)
    const finalSlot = { ...slotToAdd, id: slotId }

    const assigned = Boolean(
      finalSlot.intervieweeId && selectedIntervieweeDocId,
    )
    const batch = writeBatch(db)
    batch.set(
      doc(db, interviewTimesCollection, finalSlot.id),
      withSemester({
        ...finalSlot,
        date: new Date(finalSlot.date),
      }),
    )
    if (assigned) {
      batch.update(
        doc(db, applicationsCollection, selectedIntervieweeDocId as string),
        { 'meta.interview': true },
      )
    }
    await batch.commit()

    if (assigned) {
      const payload = buildAssignInterviewApiPayload(finalSlot)
      const res = await fetch('/api/assignInterview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to send interview assignment email')
      }
    }

    return finalSlot
  },

  /**
   * Updates an existing interview slot's date and meeting link in Firestore.
   *
   * Only those two fields: they are all the edit card changes. This used to
   * write the whole slot back from the copy the page loaded, which would
   * erase a booking an applicant made through portal's /api/interview in the
   * meantime - leaving their application flagged for an interview on a slot
   * that no longer names them. Still stamped with the semester, like every
   * other slot write, since search filters on it.
   */
  async updateInterviewSlot(interview: Data.InterviewSlot): Promise<void> {
    await updateDoc(
      doc(db, interviewTimesCollection, interview.id),
      withSemester({
        date: new Date(interview.date),
        meetingLink: interview.meetingLink,
      }),
    )
  },

  /**
   * Deletes an interview slot from Firestore.
   *
   * When the slot was booked (`intervieweeId` set), clears that applicant's
   * `meta.interview` flag in the same transaction - otherwise it stays stuck
   * `true` with no slot behind it, which hides them from
   * `fetchEligibleInterviewees` and from the Interview Time Requests queue
   * (both gated on `meta.interview === false`) with no way to reschedule
   * them short of editing Firestore by hand. Mirrors
   * `createOrAssignInterviewSlot` setting the flag `true` when a slot is
   * booked.
   *
   * A transaction, not a batch, because the applicant's document isn't
   * guaranteed to still exist (their application could have been deleted
   * independently of this slot, including by account deletion) - `update()`
   * throws on a missing document, and inside a batch that failure takes the
   * slot delete down with it, permanently blocking cleanup of an otherwise
   * harmless orphaned slot. Reading first and skipping the update when the
   * document is gone keeps the slot deletable either way.
   */
  async deleteInterviewSlot(
    slot: Pick<Data.InterviewSlot, 'id' | 'intervieweeId'>,
  ): Promise<void> {
    const slotRef = doc(db, interviewTimesCollection, slot.id)
    if (!slot.intervieweeId) {
      await deleteDoc(slotRef)
      return
    }
    const appRef = doc(db, applicationsCollection, slot.intervieweeId)
    await runTransaction(db, async (transaction) => {
      const appSnap = await transaction.get(appRef)
      transaction.delete(slotRef)
      if (appSnap.exists()) {
        transaction.update(appRef, { 'meta.interview': false })
      }
    })
  },
}
