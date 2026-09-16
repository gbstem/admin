// docIds.ts - Builders and parsers for the document ids that encode who (or
// what) a document belongs to. Kept byte-identical in admin and portal, and
// free of `$lib` imports so scripts and Cypress specs can use it too.
//
// Several collections key their documents by an account uid plus a suffix,
// and code sometimes has to recover one part from the id. Build and parse
// those ids only through the functions here - never with an inline `split`,
// `replace` or `match` - so each shape is written down once, with its builder
// beside its parser.
//
// Firebase Auth's generated uids are 28 alphanumeric characters, but a uid set
// explicitly (the emulator seed's `instructor-demo-uid`) can contain `-`. So no
// parser here splits on the first `-`: each anchors on the suffix its shape
// ends with.

// ------------------------------------------------------------------ classes

/** `semesters/{id}/classes/{id}`: `${instructorUid}-${classNumber}`. */
export function classDocId(instructorUid: string, classNumber: number): string {
  return `${instructorUid}-${classNumber}`
}

/**
 * The instructor and number a class id was built from, or null for an id in
 * another shape (older classes such as `class-python1`). Only the portal names
 * classes this way, and firestore.rules only lets an instructor create one
 * under their own uid - so the uid is a record of who created the class,
 * though it may name an account that has since been deleted.
 */
export function parseClassDocId(
  id: string,
): { instructorUid: string; classNumber: number } | null {
  const match = id.match(/^(.+)-(\d+)$/)
  return match
    ? { instructorUid: match[1], classNumber: Number(match[2]) }
    : null
}

/**
 * Whether `id` is exactly one of `uid`'s own class ids, numbered from 1 with no
 * leading zero - the only shape `nextClassId` produces. Exact rather than a
 * prefix test: `instructor` must not own `instructor-demo-uid-1`.
 */
export function isOwnClassId(id: string, uid: string): boolean {
  return id.startsWith(`${uid}-`) && /^[1-9]\d*$/.test(id.slice(uid.length + 1))
}

/** The id for `uid`'s next class: one past the highest number they own. */
export function nextClassDocId(existingIds: string[], uid: string): string {
  const numbers = existingIds
    .filter((id) => isOwnClassId(id, uid))
    .map((id) => Number(id.slice(uid.length + 1)))
  return classDocId(uid, numbers.length > 0 ? Math.max(...numbers) + 1 : 1)
}

// ------------------------------------------------------------ registrations

/**
 * `semesters/{id}/registrations/{id}`: `${parentUid}-${childNumber}` for the
 * parent account's `childNumber`th student, counted from 1. Registrations
 * written before child numbers existed are keyed plain `${parentUid}`. The
 * account is a parent's, though it holds the `student` role.
 */
export function registrationDocId(
  parentUid: string,
  childNumber: number,
): string {
  return `${parentUid}-${childNumber}`
}

/**
 * The parent account a registration belongs to. The key is the registration's
 * only link to that account, so this is how a family's current address is
 * found: resolve the uid through Auth, never read the address stored on the
 * registration. Assumes the plain `${parentUid}` form never ends in
 * `-<digits>`, which holds for every Auth-generated uid.
 */
export function registrationParentUid(id: string): string {
  return id.replace(/-\d+$/, '')
}

/**
 * Whether `id` names one of parent account `uid`'s registrations: `uid` itself,
 * or `uid`, `-` and a child number. The same test firestore.rules makes in
 * isStudentUserOrTheirChild.
 */
export function isOwnRegistration(uid: string, id: string): boolean {
  return (
    id === uid ||
    (id.startsWith(`${uid}-`) && /^\d+$/.test(id.slice(uid.length + 1)))
  )
}

// ------------------------------------------------------------- sub requests

/**
 * `subRequests/{id}`: `${classId}---${sessionNumber}` - one request per
 * session of a class, whoever files it.
 */
export function subRequestDocId(
  classId: string,
  sessionNumber: number,
): string {
  return `${classId}---${sessionNumber}`
}

/**
 * The class and session a sub request id was built from, or null for an id in
 * another shape. The id is the only record of the class: the request's own
 * `id` field holds it at creation, but nothing reads that.
 */
export function parseSubRequestDocId(
  id: string,
): { classId: string; sessionNumber: number } | null {
  const match = id.match(/^(.+)---(\d+)$/)
  return match ? { classId: match[1], sessionNumber: Number(match[2]) } : null
}

// -------------------------------------------------- interview time requests

/**
 * `interviewTimeRequests/{id}`: `${uid}-${date}`, where `date` is the
 * `YYYY-MM-DDTHH:mm` value the applicant picked.
 */
export function slotRequestDocId(uid: string, date: string): string {
  return `${uid}-${date}`
}

/**
 * The applicant who filed an interview time request, or null for an id in
 * another shape. Requests carry their own `uid` field now; this is for the
 * ones written before it.
 */
export function slotRequestUid(id: string): string | null {
  return id.match(/^(.+?)-\d{4}-\d{2}-\d{2}/)?.[1] ?? null
}

// ---------------------------------------------------------- interview slots

/**
 * `semesters/{id}/instructorInterviewTimes/{id}`: the slot's start time in
 * epoch milliseconds, then the creating interviewer's uid. There is no parser:
 * a slot records `interviewerUid`, so nothing needs to recover it from the id.
 */
export function interviewSlotDocId(
  dateISO: string,
  interviewerUid = '',
): string {
  return `${new Date(dateISO).getTime()}${interviewerUid}`
}
