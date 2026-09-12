// backfill-interviewer-uids.ts - Backfill for the interview side of the
// email-to-uid migration: interview slots, and interview time requests.
//
// Background: interview slot documents used to identify their interviewer by
// `interviewerEmail` only. If an interviewer later changed their account email
// address, their existing slots were orphaned because permission checks and
// filtering compared `interviewerEmail` against the live Auth email. PR #65
// added `interviewerUid` to identify interview slot ownership stably.
//
// This script walks all interview slot documents across all semesters in
// Firestore (`semesters/{semesterId}/instructorInterviewTimes`), looks up the
// interviewer's UID via Firebase Auth using `interviewerEmail`, and stamps
// `interviewerUid` onto each slot. It does the same for the applicant a slot is
// booked for, stamping a missing `intervieweeId` from `intervieweeEmail`. An
// unbooked slot has neither, and is left alone.
//
// It also covers the top-level `interviewTimeRequests` collection, whose
// documents gained an explicit `uid` in Phase 2 of notes/EMAIL_TO_UID_AUDIT.md.
// Older ones carry only `email`, and admin recovers the requester by parsing
// the `${uid}-${date}` document ID (parseSlotRequestDoc). This stamps that same
// uid when an account still has it - firestore.rules only lets a client create
// a request under its own uid, so the ID is the better record - and falls back
// to the address's owner when it doesn't. Requests are ignored by the UI after
// 30 days; they are backfilled anyway so every document fits the schema, and
// future analytics or migrations needn't know which ones predate the field.
//
// An address that no account owns is flagged UNRESOLVED, and its document is
// left with the address and no uid.
//
// Usage:
//   npx tsx scripts/backfill-interviewer-uids.ts
//       Stamp missing interviewerUid, intervieweeId and time request uid
//       fields. KEEP every address.
//   npx tsx scripts/backfill-interviewer-uids.ts --strip-emails
//       Stamp as above, then delete interviewerEmail, intervieweeEmail and a
//       time request's email wherever a live Auth account's uid now backs
//       them. Read STRIPPING ADDRESSES below first.
//   ... --strip-unresolved  With --strip-emails, also delete the addresses it
//                       flags UNRESOLVED - the only record of who they were.
//   ... --dry-run       Preview counts + a sample, no writes
//   ... --production    Target production instead of the emulator
//
// STRIPPING ADDRESSES (notes/EMAIL_TO_UID_AUDIT.md Phase 5) - the data has to
// outlive the code that reads it:
//
//   1. Run without --strip-emails, --dry-run first, and review every
//      UNRESOLVED line: an address no account owns, so no uid could be stamped
//      for it. Fix what can be fixed by hand and re-run.
//   2. Ship the app code that stops reading and writing these addresses:
//      Phase 5 item 4, which moves every view that displays one onto a uid
//      lookup (the audit lists them), and Phase 4, which removes the server
//      fallbacks and the client writes. Strip before item 4 and those views go
//      blank; before Phase 4, the next booking writes intervieweeEmail back.
//   3. Run --strip-emails --dry-run. Its UNRESOLVED lines add stored uids that
//      name deleted accounts, and are exactly what it will keep. Decide on
//      them, then run --strip-emails - with --strip-unresolved only if the
//      decision was to lose them too.
//
// An address a live uid backs loses nothing when stripped: Auth has that
// person's current address. Re-running --strip-emails later is the check that
// nothing wrote one back.
//
// Idempotent: only updates documents that still need changing, so re-running
// after a partial failure is safe.
import admin from 'firebase-admin'
import { semesterCollectionPath } from '../src/lib/data/collections'
import collectionsList from '../src/lib/data/collectionsList.json'
import {
  interviewSlotEmailFields,
  slotRequestEmailFields,
  storedUid,
  uidFromSlotRequestId,
  type Resolution,
} from './lib/emailToUidTransforms'
import {
  addTally,
  backfillEmailFields,
  createAuthLookup,
  emptyTally,
  unresolvedSummary,
  type BackfillContext,
} from './lib/uidBackfillRuntime'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')
const stripEmails = args.includes('--strip-emails')
const stripUnresolved = args.includes('--strip-unresolved')

if (stripUnresolved && !stripEmails) {
  console.error('--strip-unresolved only applies alongside --strip-emails.')
  process.exit(1)
}

if (isProduction) {
  if (
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  ) {
    console.error(
      'Refusing to run with --production while FIRESTORE_EMULATOR_HOST or ' +
        'FIREBASE_AUTH_EMULATOR_HOST is set in the environment. Unset them, ' +
        'or remove --production to target the emulator instead.',
    )
    process.exit(1)
  }
  const hasCertCreds =
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_PROJECT_ID
  if (!hasCertCreds && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'Refusing to run with --production: no credentials found in the environment. Set ' +
        'FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_PROJECT_ID (the same ' +
        'variables src/lib/server/firebase.ts uses, e.g. sourced from .env.local.prod), or ' +
        'GOOGLE_APPLICATION_CREDENTIALS.',
    )
    process.exit(1)
  }
  console.log(
    `Connecting to PRODUCTION Firestore project ` +
      `"${process.env.FIREBASE_PROJECT_ID ?? '(resolved via GOOGLE_APPLICATION_CREDENTIALS)'}"...`,
  )
  admin.initializeApp(
    hasCertCreds
      ? {
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        }
      : undefined,
  )
} else {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gbstem'
  console.log('Connecting to Firebase emulators at:')
  console.log(`- Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}`)
  console.log(`- Auth: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`)
  console.log(`- Project ID: ${process.env.GCLOUD_PROJECT}\n`)
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT })
}

const lookup = createAuthLookup(admin.auth())
const ctx: BackfillContext = {
  db: admin.firestore(),
  lookup,
  isDryRun,
  stripEmails,
  stripUnresolved,
  deleteField: admin.firestore.FieldValue.delete(),
}

// Not semester-scoped, and has no constant in collections.ts: admin's
// interviewService and portal's name it inline too.
const SLOT_REQUESTS_COLLECTION = 'interviewTimeRequests'

/**
 * Decides what uid to stamp on an interview time request: the one in its
 * document ID while that account exists, since that is who created it and who
 * admin already shows as the requester; otherwise the stored address's owner.
 */
async function resolveSlotRequestUid(
  requestId: string,
  email: string | null,
): Promise<Resolution> {
  const idUid = uidFromSlotRequestId(requestId)

  if (idUid && (await lookup.uidExists(idUid))) {
    const byEmail = email ? await lookup.uidForEmail(email) : null
    return {
      uid: idUid,
      note:
        byEmail && 'uid' in byEmail && byEmail.uid !== idUid
          ? `via document ID - ${email} now belongs to ${byEmail.uid}`
          : undefined,
    }
  }

  if (email) {
    const byEmail = await lookup.uidForEmail(email)
    if ('uid' in byEmail) {
      return {
        uid: byEmail.uid,
        note: idUid
          ? `via email - document ID uid ${idUid} has no account`
          : 'via email - the document ID has no uid prefix',
      }
    }
    return {
      reason: idUid
        ? `${byEmail.reason}, and document ID uid ${idUid} has no account either`
        : `${byEmail.reason}, and the document ID has no uid prefix`,
    }
  }

  return idUid
    ? {
        reason: `document ID uid ${idUid} has no account, and there is no email`,
      }
    : { reason: 'no email and no uid prefix in the document ID' }
}

async function main() {
  const semesters = (collectionsList as { id: string; name: string }[]).map(
    (s) => s.id,
  )
  console.log(
    `${isDryRun ? '[DRY RUN] ' : ''}Backfilling interview uids across ` +
      `${semesters.length} semester(s): ${semesters.join(', ')}; and ${SLOT_REQUESTS_COLLECTION}`,
  )
  console.log(
    stripEmails
      ? `Stamping uids, and removing every address a live account's uid backs` +
          `${stripUnresolved ? ' - and, with --strip-unresolved, the ones none does' : ''}.\n`
      : 'Stamping uids only, leaving every address in place.\n',
  )

  const slotTotals = emptyTally()
  for (const semesterId of semesters) {
    console.log(`Semester ${semesterId}:`)
    addTally(
      slotTotals,
      await backfillEmailFields(
        ctx,
        semesterCollectionPath(semesterId, 'instructorInterviewTimes'),
        interviewSlotEmailFields,
      ),
    )
  }

  console.log('Interview time requests:')
  const requestTotals = await backfillEmailFields(
    ctx,
    SLOT_REQUESTS_COLLECTION,
    slotRequestEmailFields,
    {
      resolveUid: (docId) => ({
        uid: (email) => resolveSlotRequestUid(docId, email),
      }),
      // The document ID needs no address to go on.
      alsoNeedsWork: (data) => storedUid(data, 'uid') === null,
    },
  )

  const totals = emptyTally()
  addTally(totals, slotTotals)
  addTally(totals, requestTotals)
  console.log(
    `\n${isDryRun ? '[DRY RUN] Would update' : 'Updated'} ${slotTotals.count} interview slot document(s) ` +
      `across ${semesters.length} semester(s) and ${requestTotals.count} interview time request(s): ` +
      `${totals.stamped} uid(s) stamped, ${totals.stripped} address(es) removed.`,
  )
  const unresolved = unresolvedSummary(totals.unresolved, ctx)
  if (unresolved) console.warn(`\n${unresolved}`)
}

main().catch((err) => {
  console.error('Backfill script failed:', err)
  process.exit(1)
})
