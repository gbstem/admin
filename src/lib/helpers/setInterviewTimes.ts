import { getInterviewSlotDefaults } from '$lib/components/forms/schemas'
import { toLocalISOString } from '$lib/utils'
import type {} from '../../data.d.ts'

type ApplicationMeta = Partial<Data.Application<'pojo'>['meta']>

/**
 * Whether `decision` settles an application: any official decision except
 * `interview`, which only invites the applicant to schedule one.
 */
export function isFinalDecision(
  decision: Data.Decision | null | undefined,
): boolean {
  return Boolean(decision) && decision !== 'interview'
}

/** Why an applicant can't be given an interview right now. */
export type InterviewIneligibility = 'unsubmitted' | 'scheduled' | 'decided'

/**
 * Why the applicant behind `meta` can't be scheduled, or null when they need
 * an interview: submitted, with no interview held or booked (a missed one
 * doesn't count - see `meta.interview`), and not yet decided.
 *
 * The one rule behind the eligible-interviewee picker, the time-request list,
 * and every server write that books an interview - admin's
 * createInterviewSlot here, and portal's /api/interview and /api/slotRequest,
 * which keep their own copy of this rule.
 */
export function interviewIneligibility(
  meta: ApplicationMeta | undefined,
): InterviewIneligibility | null {
  if (!meta?.submitted) return 'unsubmitted'
  if (meta.interview) return 'scheduled'
  if (isFinalDecision(meta.decisionType)) return 'decided'
  return null
}

/** True when the applicant behind `meta` can be given an interview. */
export function needsInterview(meta: ApplicationMeta | undefined): boolean {
  return interviewIneligibility(meta) === null
}

/**
 * Parses raw Firestore document data into a Data.InterviewSlot object.
 */
export function parseInterviewSlotDoc(
  id: string,
  data: any,
): Data.InterviewSlot | null {
  if (!data || !data.date) return null
  const timestampSeconds =
    data.date.seconds ??
    (data.date instanceof Date ? data.date.getTime() / 1000 : 0)
  return {
    ...data,
    date: toLocalISOString(new Date(timestampSeconds * 1000)),
    id,
  } as Data.InterviewSlot
}

/**
 * Parses raw Firestore document data into a Data.SlotRequest object.
 */
export function parseSlotRequestDoc(
  id: string,
  data: any,
): Data.SlotRequest | null {
  if (!data || !data.date) return null
  const timestampSeconds =
    data.date.seconds ??
    (data.date instanceof Date ? data.date.getTime() / 1000 : 0)
  return {
    date: new Date(timestampSeconds * 1000),
    id,
    uid: data.uid ?? '',
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
  }
}

/**
 * Sorts slot requests chronologically by date.
 */
export function sortSlotRequestsByDate(
  requests: Data.SlotRequest[],
): Data.SlotRequest[] {
  return [...requests].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** An applicant who can be given an interview, as the picker offers them. */
export interface EligibleInterviewee {
  applicationId: string
  /** The applicant's account; the application's id on every current one. */
  uid: string
  firstName: string
  lastName: string
}

/** The picker's label for `interviewee`. */
export function intervieweeLabel(interviewee: EligibleInterviewee): string {
  return `${interviewee.firstName} ${interviewee.lastName}`.trim()
}

/**
 * The applicants among `docs` (application snapshots) who need an interview -
 * see needsInterview - sorted by name.
 */
export function filterEligibleInterviewees(
  docs: { id: string; data: () => any }[],
): EligibleInterviewee[] {
  return docs
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
    .filter(({ data }) => needsInterview(data?.meta))
    .map(({ id, data }) => ({
      applicationId: id,
      uid: data.meta.uid || id,
      firstName: data.personal?.firstName ?? '',
      lastName: data.personal?.lastName ?? '',
    }))
    .sort((a, b) => intervieweeLabel(a).localeCompare(intervieweeLabel(b)))
}

/** How long a request stays listed after its time has passed. */
const PAST_REQUEST_DAYS = 30

/** One applicant's open time requests, as the request list shows them. */
export interface SlotRequestGroup {
  interviewee: EligibleInterviewee
  /** Soonest first. */
  requests: Data.SlotRequest[]
}

/**
 * The time requests to list, grouped by the applicant who filed them: only
 * applicants who still need an interview (`eligible`), and only requests
 * upcoming or under 30 days past. Requests are never edited when an
 * applicant is scheduled, unscheduled or decided - whether they show is
 * worked out here, so they reappear when a booking is cancelled or missed.
 *
 * Groups are ordered by their soonest request.
 */
export function groupSlotRequests(
  requests: Data.SlotRequest[],
  eligible: EligibleInterviewee[],
  now: Date = new Date(),
): SlotRequestGroup[] {
  const byUid = new Map(eligible.map((e) => [e.uid, e]))
  const cutoff = now.getTime() - PAST_REQUEST_DAYS * 24 * 60 * 60 * 1000
  const groups = new Map<string, SlotRequestGroup>()
  for (const request of sortSlotRequestsByDate(requests)) {
    const interviewee = byUid.get(request.uid)
    if (!interviewee || request.date.getTime() <= cutoff) continue
    const group = groups.get(request.uid) ?? { interviewee, requests: [] }
    group.requests.push(request)
    groups.set(request.uid, group)
  }
  return [...groups.values()]
}

/** True when `slot` is booked, its time has come, and it can be marked missed. */
export function canMarkSlotMissed(
  slot: Pick<
    Data.InterviewSlot,
    'date' | 'interviewSlotStatus' | 'intervieweeId'
  >,
  now: Date = new Date(),
): boolean {
  return (
    slot.interviewSlotStatus === 'pending' &&
    Boolean(slot.intervieweeId) &&
    new Date(slot.date) <= now
  )
}

/**
 * Generates clean default Data.InterviewSlot object.
 */
export function resetInterviewSlotToAdd(
  interviewerName: string = '',
  interviewerUid: string = '',
): Data.InterviewSlot {
  return getInterviewSlotDefaults(interviewerName, interviewerUid)
}

/**
 * True when `slot` belongs to the signed-in user.
 *
 * By uid alone: a slot records no address to match on, and one written before
 * `interviewerUid` existed belongs to nobody this can identify.
 */
export function isOwnInterviewSlot(
  slot: Pick<Data.InterviewSlot, 'interviewerUid'>,
  userUid?: string | null,
): boolean {
  return Boolean(slot.interviewerUid) && slot.interviewerUid === userUid
}

/**
 * Checks whether a user has permissions to modify a given interview slot.
 */
export function canUserModifySlot(
  slot: Pick<Data.InterviewSlot, 'interviewerUid'>,
  userUid?: string | null,
  userRole?: string | null,
): boolean {
  return isOwnInterviewSlot(slot, userUid) || userRole === 'admin'
}

/**
 * Maps an interview slot into superform-compatible values.
 *
 * `id` is deliberately absent: `interviewSlotSchema` doesn't describe it and
 * `interviewSlotDocId` produces it at write time, so it is carried
 * alongside the form data rather than through it.
 *
 * Same hazard as the other forms' mappers - a schema field missing here shows
 * the schema's default instead of the stored value, and both slot writes are
 * `setDoc` with no `{ merge: true }`, so that default is then stored.
 */
export function toInterviewSlotFormValues(slot: Data.InterviewSlot) {
  return {
    date: slot.date || '',
    meetingLink: slot.meetingLink || '',
    interviewerName: slot.interviewerName || '',
    interviewerUid: slot.interviewerUid || '',
    intervieweeFirstName: slot.intervieweeFirstName || '',
    intervieweeLastName: slot.intervieweeLastName || '',
    intervieweeId: slot.intervieweeId || '',
    interviewSlotStatus: slot.interviewSlotStatus || ('available' as const),
  }
}
