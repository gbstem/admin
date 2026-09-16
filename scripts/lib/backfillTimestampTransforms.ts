// Pure, Firestore-connection-free transform logic for the timestamps.created backfill
// (scripts/backfill-created-timestamp.ts). Kept in its own module, with no import-time
// side effects, so it can be unit tested without an emulator/production connection.
//
// Background: registration and application documents created through the portal's
// student-facing forms had timestamps.created hardcoded to null in
// createEmptyRegistration/createEmptyApplication, and no write path ever replaced it with
// a real timestamp - every save only ever stamped timestamps.updated. That's now fixed in
// the portal repo (RegistrationForm.svelte / ApplyForm.svelte self-heal timestamps.created
// on their next save), but documents that won't be saved again by their owner (submitted,
// enrolled, decided) stay broken until backfilled here. This module decides which documents
// still need that backfill.
import { registrationParentUid } from '../../src/lib/data/docIds'

// Whether a document's timestamps.created is a real Firestore Timestamp (as opposed to
// null, missing, or the pre-fix `null as any` default that was actually written to
// Firestore). A Timestamp is the only shape with a `.toDate` method, so that's what we
// check instead of comparing against a specific bad value.
export function timestampsNeedBackfill(
  timestamps: Record<string, any> | undefined,
): boolean {
  return !timestamps || typeof timestamps.created?.toDate !== 'function'
}

// A registration/application document's owner, as far as it can be determined without
// touching Firebase Auth. `authEmail` is left null here and filled in by the caller from
// an Auth lookup, so this stays pure and unit-testable.
export type BackfillIdentity = {
  docId: string
  // The Auth uid to look the account email up by. See authUidFromDocId.
  authUid: string
  // personal.email as stored on the document. For applications this is the applicant's
  // own address; for registrations it's the parent/guardian account address, copied from
  // the signed-in profile when the registration was bootstrapped.
  docEmail: string | null
  secondaryEmail: string | null
  // The signed-in account's address, from Auth. Null until the caller resolves it (and
  // when the account has since been deleted).
  authEmail: string | null
}

// Maps a document id to the Auth uid that owns it. Application documents are keyed by the
// applicant's uid directly, but a parent's child registrations are keyed `{parentUid}-1`,
// `{parentUid}-2`, ... (the same convention firestore.rules' belongsToSameUser relies on),
// so the slot suffix has to come off before the uid means anything to Auth. Firebase uids
// are alphanumeric, so a trailing `-<digits>` is unambiguously a slot suffix.
export function authUidFromDocId(docId: string): string {
  return registrationParentUid(docId)
}

// Pulls whatever the document itself knows about its owner. Everything is optional: these
// are exactly the documents that were written through a broken path, so no field on them
// is guaranteed to be populated.
export function identityFromDoc(
  docId: string,
  data: Record<string, any> | undefined,
): BackfillIdentity {
  const personal = data?.personal ?? {}
  const normalize = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  return {
    docId,
    authUid: authUidFromDocId(docId),
    docEmail: normalize(personal.email),
    secondaryEmail: normalize(personal.secondaryEmail),
    authEmail: null,
  }
}

// Renders an identity's addresses for the console, labelled by where each came from and
// de-duplicated so the common case (account address == form address) prints once. The Auth
// address leads because that's the one identifying the signed-in browser session, which is
// what a document that keeps needing this backfill points at.
export function formatIdentityEmails(identity: BackfillIdentity): string {
  const seen = new Set<string>()
  const parts: string[] = []
  const add = (label: string, email: string | null) => {
    if (!email) return
    const key = email.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    parts.push(`${label} ${email}`)
  }
  add('account', identity.authEmail)
  add('form', identity.docEmail)
  add('secondary', identity.secondaryEmail)
  return parts.length > 0
    ? parts.join(', ')
    : '(no email on document or account)'
}

// The addresses worth contacting about one document, lowercased for de-duplication across
// the run's end-of-run summary.
export function contactableEmails(identity: BackfillIdentity): string[] {
  return [identity.authEmail, identity.docEmail, identity.secondaryEmail]
    .filter((email): email is string => Boolean(email))
    .map((email) => email.toLowerCase())
}
