// emailToUidTransforms.ts - Pure transform logic shared by the email-to-uid
// backfill scripts (scripts/backfill-class-instructor-uids.ts and
// scripts/backfill-interviewer-uids.ts). Kept free of side effects so it can be
// unit tested without connecting to Firestore or Auth.
//
// Every collection whose documents identified a person by a stored email
// address, and now do by uid, is listed below with its address/uid pairs - in
// every semester, past ones included, since both scripts walk
// collectionsList.json. Two kinds of stored address are deliberately not:
//
// - `personal.email` and `personal.secondaryEmail` on applications and
//   registrations are contact details, not identities: a student has no Auth
//   account, and a secondary guardian needn't have one (audit section 2).
// - The pre-semester flat collections (`classesFall24`,
//   `instructorInterviewTimesSpring26`, ...) are an unreachable read-only backup
//   awaiting deletion - no rule matches them - see notes/DEAD_COLLECTION_ANALYSIS.md.
//   Deleting them is the migration for those.

/**
 * A stored address and the uid field that replaces it, named from the `Data`
 * schema so the two can't drift apart.
 *
 * When Phase 4 of notes/EMAIL_TO_UID_AUDIT.md deletes an address from its
 * `Data` type, the list naming it stops typechecking (`yarn check` reaches this
 * module through its tests). Widen the type there rather than dropping the
 * pair - e.g. `SchemaField<Data.Class & { instructorEmail?: string }>` -
 * because stored documents keep the address until --strip-emails has run.
 */
type SchemaField<T> = {
  readonly email: Extract<keyof T, string>
  readonly uid: Extract<keyof T, string>
}

export type EmailUidField = { readonly email: string; readonly uid: string }

/**
 * `semesters/{id}/classes`. The legacy `otherInstructorEmails` string isn't
 * listed: it maps to a uid list rather than one uid, and the class backfill
 * handles it on its own.
 */
export const classEmailFields = [
  { email: 'instructorEmail', uid: 'instructorUid' },
] as const satisfies readonly SchemaField<Data.Class>[]

/** The top-level `subRequests` collection. */
export const subRequestEmailFields = [
  { email: 'originalInstructorEmail', uid: 'originalInstructorUid' },
  { email: 'subInstructorEmail', uid: 'subInstructorId' },
] as const satisfies readonly SchemaField<Data.SubRequest>[]

/** `semesters/{id}/instructorInterviewTimes`. */
export const interviewSlotEmailFields = [
  { email: 'interviewerEmail', uid: 'interviewerUid' },
  { email: 'intervieweeEmail', uid: 'intervieweeId' },
] as const satisfies readonly SchemaField<Data.InterviewSlot>[]

/**
 * The top-level `interviewTimeRequests` collection. `Data.SlotRequest` is
 * admin's parsed form of one of its documents, with the same field names.
 */
export const slotRequestEmailFields = [
  { email: 'email', uid: 'uid' },
] as const satisfies readonly SchemaField<Data.SlotRequest>[]

/** A uid found for a document, with anything worth reporting about how. */
export type Resolution = { uid: string; note?: string } | { reason: string }

/**
 * Whether a uid backs an address: one names a live Auth account, one names an
 * account that has since been deleted, or there is no uid at all.
 */
export type UidStatus = 'live' | 'no account' | 'missing'

/** What a backfill run found, and will do, for one address/uid pair. */
export type FieldOutcome = {
  /** The stored address, normalized; null when absent or blank. */
  email: string | null
  /** A uid this run found for a document that had none. */
  stamp?: { uid: string; note?: string }
  /** Why no live account's uid backs this field, if none does. */
  unresolved?: string
  /** Whether the address is to be deleted. */
  strip: boolean
}

type StoredDoc = Record<string, unknown>

/**
 * Trims and lowercases a stored address; null when the value is missing, not a
 * string, or blank.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length > 0 ? email : null
}

/**
 * The uid stored in `field`, trimmed; null when it is absent, not a string, or
 * blank. Several write paths default a uid field to '', which names nobody.
 */
export function storedUid(data: StoredDoc, field: string): string | null {
  const value = data[field]
  if (typeof value !== 'string') return null
  const uid = value.trim()
  return uid.length > 0 ? uid : null
}

/**
 * Whether a document has anything for a backfill run to look at: an address
 * with no uid beside it, or - when stripping - an address field at all, blank
 * ones included, since removing the field is the point.
 */
export function needsEmailFieldWork(
  data: StoredDoc,
  fields: readonly EmailUidField[],
  options: { stripEmails: boolean },
): boolean {
  return fields.some(
    (field) =>
      (storedUid(data, field.uid) === null &&
        normalizeEmail(data[field.email]) !== null) ||
      (options.stripEmails && field.email in data),
  )
}

/**
 * Whether --strip-emails deletes an address field.
 *
 * An address goes when a live account's uid backs it, because Auth then has
 * that person's current address and the stored one is only a stale copy. A
 * blank field goes too: it records nobody. Otherwise the address is the only
 * record of who the document belonged to, and it stays unless the caller has
 * decided, with --strip-unresolved, that nobody needs to know.
 */
export function decideEmailStrip(
  data: StoredDoc,
  emailField: string,
  uidStatus: UidStatus,
  options: { stripUnresolved: boolean },
): 'none' | 'strip' | 'keep' {
  if (!(emailField in data)) return 'none'
  if (normalizeEmail(data[emailField]) === null || uidStatus === 'live') {
    return 'strip'
  }
  return options.stripUnresolved ? 'strip' : 'keep'
}

/**
 * The class ID a sub request is for. Sub requests are keyed
 * `${classId}---${classNumber}` (see portal's subRequestClassId), and a class
 * ID in turn starts with its owner's uid - see instructorUidFromClassId.
 *
 * Null when the ID has no `---`, rather than portal's whole-ID fallback: then
 * nothing in it is a candidate.
 */
export function classIdFromSubRequestId(subRequestId: string): string | null {
  const index = subRequestId.indexOf('---')
  return index > 0 ? subRequestId.slice(0, index) : null
}

/**
 * The requester's uid from an interview time request's ID, which portal writes
 * as `${uid}-${requestedDate}` with the date as YYYY-MM-DD... - the same parse
 * admin's parseSlotRequestDoc falls back to. Null when no date follows.
 *
 * Like instructorUidFromClassId, this only proposes a candidate; the caller
 * asks Auth whether it is a real account.
 */
export function uidFromSlotRequestId(requestId: string): string | null {
  return requestId.match(/^(.+?)-\d{4}-\d{2}-\d{2}/)?.[1] ?? null
}

/**
 * The log line flagging an address that no live account's uid backs, or null
 * when there is nothing to flag. An absent or blank address isn't flagged:
 * there is no address to decide about.
 */
export function describeUnresolved(
  where: string,
  emailField: string,
  outcome: FieldOutcome,
  options: { stripEmails: boolean },
): string | null {
  if (!outcome.unresolved || outcome.email === null) return null
  const fate = !options.stripEmails
    ? 'no uid stamped'
    : outcome.strip
      ? 'removed anyway (--strip-unresolved)'
      : 'kept'
  return `UNRESOLVED ${where} ${emailField} "${outcome.email}": ${outcome.unresolved}; ${fate}`
}
