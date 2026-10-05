import { errorMessage } from '$lib/shared/apiErrors'
import { db } from '$lib/client/firebase'
import { accountEmailService } from '$lib/services/accountEmailService'
import {
  applicationsCollection,
  interviewTimeRequestsCollection,
  interviewTimesCollection,
} from '$lib/data/collections'
import type {
  ChangeSlotResponse,
  CreateSlotRequestBody,
  CreateSlotResponse,
  DeleteSlotRequestBody,
  MarkMissedRequestBody,
  UpdateSlotRequestBody,
} from '../../routes/api/interviewSlot/+server'
import {
  filterEligibleInterviewees,
  type EligibleInterviewee,
  parseInterviewSlotDoc,
  parseSlotRequestDoc,
  sortSlotRequestsByDate,
} from '$lib/helpers/setInterviewTimes'
import { collection, getDocs, query, where } from 'firebase/firestore'

/** Sends one slot write to `/api/interviewSlot`, throwing its refusal. */
async function slotRequest(method: string, body: unknown): Promise<Response> {
  const res = await fetch('/api/interviewSlot', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res))
  }
  return res
}

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
   * The current addresses of the applicants who filed `requests`, keyed by
   * request id. A request whose applicant account is gone is absent, and the
   * list shows no address - requests store none.
   */
  fetchSlotRequestEmails(
    requests: Data.SlotRequest[],
  ): Promise<Record<string, string>> {
    return accountEmailService.resolveEmailsByDocument(
      requests,
      ({ ids, uids }) => ({
        intent: 'slotRequestApplicants',
        uids,
        context: { requestIds: ids },
      }),
    )
  },

  /** Fetches this semester's slot requests, sorted by date. */
  async fetchSlotRequests(): Promise<Data.SlotRequest[]> {
    const slotRequests: Data.SlotRequest[] = []
    const q = query(collection(db, interviewTimeRequestsCollection))
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
   * The applicants who still need an interview (see needsInterview), sorted
   * by name. Only applications not already interviewing are read.
   */
  async fetchEligibleInterviewees(): Promise<EligibleInterviewee[]> {
    const q = query(
      collection(db, applicationsCollection),
      where('meta.interview', '==', false),
    )
    const querySnapshot = await getDocs(q)
    return filterEligibleInterviewees(querySnapshot.docs)
  },

  /**
   * Adds the signed-in interviewer's slot through `/api/interviewSlot`,
   * assigned to `applicationId`'s applicant when given - which also flags
   * their application and emails them. Resolves to the slot's id and whether
   * that email went out.
   */
  async createOrAssignInterviewSlot(
    slotToAdd: Pick<Data.InterviewSlot, 'date' | 'meetingLink'>,
    applicationId?: string,
  ): Promise<CreateSlotResponse> {
    const res = await slotRequest('POST', {
      date: new Date(slotToAdd.date).toISOString(),
      meetingLink: slotToAdd.meetingLink,
      ...(applicationId ? { applicationId } : {}),
    } satisfies CreateSlotRequestBody)
    return res.json()
  },

  /**
   * Changes a slot's date and meeting link, the two fields the edit card
   * offers. A booking on the slot is left alone, and its applicant emailed
   * the change - see `emailSent`.
   */
  async updateInterviewSlot(
    interview: Data.InterviewSlot,
  ): Promise<ChangeSlotResponse> {
    const res = await slotRequest('PATCH', {
      slotId: interview.id,
      date: new Date(interview.date).toISOString(),
      meetingLink: interview.meetingLink,
    } satisfies UpdateSlotRequestBody)
    return res.json()
  },

  /**
   * Records that a booked slot's interview didn't happen, whichever side
   * missed it. The server frees the applicant to be scheduled again and
   * emails them to book again - see `emailSent`.
   */
  async markInterviewSlotMissed(
    slot: Pick<Data.InterviewSlot, 'id'>,
    missedBy: Data.InterviewMissedBy,
  ): Promise<ChangeSlotResponse> {
    const res = await slotRequest('PATCH', {
      action: 'markMissed',
      slotId: slot.id,
      missedBy,
    } satisfies MarkMissedRequestBody)
    return res.json()
  },

  /**
   * Deletes a slot. If it was booked, the server also clears that
   * applicant's `meta.interview` flag so they can be scheduled again, and
   * emails them to book again - see `emailSent`.
   */
  async deleteInterviewSlot(
    slot: Pick<Data.InterviewSlot, 'id'>,
  ): Promise<ChangeSlotResponse> {
    const res = await slotRequest('DELETE', {
      slotId: slot.id,
    } satisfies DeleteSlotRequestBody)
    return res.json()
  },
}
