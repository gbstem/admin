import { db } from '$lib/client/firebase'
import { accountEmailService } from '$lib/services/accountEmailService'
import {
  applicationsCollection,
  interviewTimeRequestsCollection,
  interviewTimesCollection,
} from '$lib/data/collections'
import type {
  CreateSlotRequestBody,
  CreateSlotResponse,
  DeleteSlotRequestBody,
  UpdateSlotRequestBody,
} from '../../routes/api/interviewSlot/+server'
import {
  filterEligibleInterviewees,
  parseInterviewSlotDoc,
  parseSlotRequestDoc,
  sortSlotRequestsByDate,
} from '$lib/helpers/setInterviewTimes'
import { collection, getDocs, query } from 'firebase/firestore'

/** Sends one slot write to `/api/interviewSlot`, throwing its refusal. */
async function slotRequest(method: string, body: unknown): Promise<Response> {
  const res = await fetch('/api/interviewSlot', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      message = (await res.json()).message ?? message
    } catch {
      // Not JSON: keep the status text.
    }
    throw new Error(message)
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
   * Fetches all slot requests from Firestore sorted by date.
   */
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
   * offers. A booking on the slot is left alone.
   */
  async updateInterviewSlot(interview: Data.InterviewSlot): Promise<void> {
    await slotRequest('PATCH', {
      slotId: interview.id,
      date: new Date(interview.date).toISOString(),
      meetingLink: interview.meetingLink,
    } satisfies UpdateSlotRequestBody)
  },

  /**
   * Deletes a slot. If it was booked, the server also clears that
   * applicant's `meta.interview` flag so they can be scheduled again.
   */
  async deleteInterviewSlot(
    slot: Pick<Data.InterviewSlot, 'id'>,
  ): Promise<void> {
    await slotRequest('DELETE', {
      slotId: slot.id,
    } satisfies DeleteSlotRequestBody)
  },
}
