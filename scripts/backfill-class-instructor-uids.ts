// backfill-class-instructor-uids.ts - Backfill for the class instructor uid
// migration: classes' co-instructor lists and primary instructors, and the sub
// requests filed against those classes.
//
// Class documents used to record co-instructors as `otherInstructorEmails`, a
// free-text comma-separated string the class owner typed by hand, which
// firestore.rules's isInstructorOfClass() honoured directly - so any address
// at all could be given write access to a class, with no check that the person
// had ever been interviewed or accepted. Co-instructors are now stored as
// `otherInstructorUids` only, and the portal will only add a uid whose account
// is an instructor with an `accepted` decision for that semester. This script
// converts what is already in Firestore, dropping (and logging) every address
// that doesn't meet that bar so leadership can follow up on it.
//
// It also stamps the class's primary `instructorUid`, which was added after
// `instructorEmail` and is absent on older documents - leaving firestore.rules
// to fall back to matching the stored address, which goes stale the moment
// that instructor changes their account email. Unlike the co-instructor half,
// this must not change *who* can reach a class, so it prefers whichever source
// preserves today's access; see resolvePrimaryInstructorUid below.
//
// Sub requests (the top-level `subRequests` collection) copy their class's
// instructor address into `originalInstructorEmail` when filed, and record the
// substitute's address beside `subInstructorId`. `originalInstructorUid` came
// later, so older requests carry only the address; this stamps it the way a
// class's instructorUid is found, and stamps a missing `subInstructorId` from
// its address. That uid is also what firestore.rules's isSubRequestOwner()
// reads, so stamping it gives the instructor of record the access to their
// request that they would have had if the field had existed when it was filed.
// Sub requests are rarely read once their session is past; they are backfilled
// so every document fits the schema, and future analytics or migrations
// needn't know which ones predate which field.
//
// Usage:
//   npx tsx scripts/backfill-class-instructor-uids.ts
//       Phase 1: stamp instructorUid + otherInstructorUids on classes and
//       originalInstructorUid + subInstructorId on sub requests. KEEP every
//       address, including otherInstructorEmails.
//   npx tsx scripts/backfill-class-instructor-uids.ts --drop-legacy-field
//       Phase 2: also delete the otherInstructorEmails field.
//   npx tsx scripts/backfill-class-instructor-uids.ts --strip-emails
//       Phase 3: stamp as above, then delete instructorEmail,
//       originalInstructorEmail and subInstructorEmail wherever a live Auth
//       account's uid now backs them. Implies --drop-legacy-field. Read
//       STRIPPING ADDRESSES below first.
//   ... --strip-unresolved  With --strip-emails, also delete the addresses it
//                       flags UNRESOLVED - the only record of who they were.
//   ... --dry-run       Preview counts + a sample, no writes
//   ... --production    Target production instead of the emulator
//                       (requires FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
//                       FIREBASE_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS
//                       already set in the environment - not loaded from any
//                       .env file by this script)
//
// DEPLOY ORDER - the two phases exist because the legacy field has to outlive
// the app deploy. Skipping a step silently costs somebody their class access:
//
//   1. Run phase 1 with --dry-run, review the dropped-address log with a lead.
//   2. Run phase 1 for real. Old app builds keep working: the string is still
//      there, and firestore.rules still grants on it.
//   3. Deploy the portal and admin app code.
//   4. Run phase 2 (--drop-legacy-field) to remove the now-unread string.
//   5. LAST: deploy firestore.rules with the otherInstructorEmails clause of
//      isInstructorOfClass() removed.
//
// Doing step 5 before step 4 completes locks out any co-instructor whose
// address never resolved to a uid; doing step 4 before step 3 lets an old
// build write `otherInstructorUids: []` back over what step 2 stamped.
//
// (All five steps are done in production, as of 2026-09-05. So is retiring the
// rules fallback on `instructorEmail`, which did NOT have to wait for every
// class to carry an instructorUid, as an earlier version of this comment
// claimed: the classes that can't get one are exactly the ones whose
// instructorEmail is missing or owned by no account, so the fallback granted
// nobody access to them anyway - notes/EMAIL_TO_UID_AUDIT.md section 9.)
//
// STRIPPING ADDRESSES (notes/EMAIL_TO_UID_AUDIT.md Phase 5) - again the data
// has to outlive the code that reads it:
//
//   1. Run phase 1, --dry-run first, and review every UNRESOLVED line: an
//      address no account owns, so no uid could be stamped for it. Fix what
//      can be fixed by hand and re-run.
//   2. Ship the app code that stops reading and writing these addresses:
//      Phase 5 item 4, which moves every page that displays one onto a uid
//      lookup (the audit lists them), and Phase 4, which removes the server
//      fallbacks and the client writes. Strip before item 4 and those pages go
//      blank; before Phase 4, the next class save or sub request claim writes
//      the address straight back.
//   3. Run --strip-emails --dry-run. Its UNRESOLVED lines add stored uids that
//      name deleted accounts, and are exactly what it will keep. Decide on
//      them, then run --strip-emails - with --strip-unresolved only if the
//      decision was to lose them too.
//
// An address a live uid backs loses nothing when stripped: Auth has that
// person's current address. Re-running --strip-emails later is the check that
// nothing wrote one back.
//
// Idempotent: only writes documents that still need changing, so re-running
// after a partial failure is safe.
import admin from 'firebase-admin'
import collectionsList from '../src/lib/data/collectionsList.json'
import {
  semesterCollectionPath,
  subRequestsCollection,
} from '../src/lib/data/collections'
import {
  classNeedsCoInstructorBackfill,
  classNeedsInstructorUidBackfill,
  instructorUidFromClassId,
  mergeCoInstructorUids,
  parseLegacyOtherInstructorEmails,
} from './lib/classInstructorBackfillTransforms'
import {
  classEmailFields,
  classIdFromSubRequestId,
  needsEmailFieldWork,
  normalizeEmail,
  storedUid,
  subRequestEmailFields,
  type Resolution,
} from './lib/emailToUidTransforms'
import {
  addTally,
  applyPlannedWrites,
  backfillEmailFields,
  createAuthLookup,
  emptyTally,
  planEmailFields,
  reportOutcomes,
  unresolvedSummary,
  type BackfillContext,
  type PlannedWrite,
} from './lib/uidBackfillRuntime'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')
const stripEmails = args.includes('--strip-emails')
const stripUnresolved = args.includes('--strip-unresolved')
// The legacy co-instructor string is an address too.
const dropLegacyField = args.includes('--drop-legacy-field') || stripEmails

if (stripUnresolved && !stripEmails) {
  console.error('--strip-unresolved only applies alongside --strip-emails.')
  process.exit(1)
}

if (isProduction) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      'Refusing to run with --production while FIRESTORE_EMULATOR_HOST is set in the ' +
        'environment. Unset it, or remove --production to target the emulator instead.',
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
            privateKey: process.env.FIREBASE_PRIVATE_KEY,
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

const db = admin.firestore()
const auth = admin.auth()
const lookup = createAuthLookup(auth)
const ctx: BackfillContext = {
  db,
  lookup,
  isDryRun,
  stripEmails,
  stripUnresolved,
  deleteField: admin.firestore.FieldValue.delete(),
}

type CoInstructorResolution =
  { uid: string } | { reason: 'no account' | 'not an instructor' | string }

/**
 * Resolves one legacy address to an accepted instructor's uid, or explains
 * why it can't be. Eligibility is checked against *that class's* semester,
 * not the current one: someone accepted in Spring25 was not thereby accepted
 * to teach in Fall26.
 *
 * Cached because a co-instructor typically appears on several classes, and
 * each miss costs an Auth round trip.
 */
const resolutionCache = new Map<string, CoInstructorResolution>()

async function resolveAcceptedInstructor(
  email: string,
  semesterId: string,
): Promise<CoInstructorResolution> {
  const cacheKey = `${semesterId}:${email}`
  const cached = resolutionCache.get(cacheKey)
  if (cached) return cached

  const resolution = await resolveUncached(email, semesterId)
  resolutionCache.set(cacheKey, resolution)
  return resolution
}

async function resolveUncached(
  email: string,
  semesterId: string,
): Promise<CoInstructorResolution> {
  let user: admin.auth.UserRecord
  try {
    user = await auth.getUserByEmail(email)
  } catch {
    return { reason: 'no account' }
  }
  if (user.customClaims?.role !== 'instructor') {
    return { reason: 'not an instructor' }
  }

  const decisionSnap = await db
    .doc(`${semesterCollectionPath(semesterId, 'decisions')}/${user.uid}`)
    .get()
  const decisionType = decisionSnap.exists
    ? (decisionSnap.data()?.type as string | undefined)
    : undefined
  if (decisionType !== 'accepted') {
    return { reason: `decision=${decisionType ?? 'none'}` }
  }
  return { uid: user.uid }
}

/**
 * Decides what to stamp as a class's primary `instructorUid`, or a sub
 * request's `originalInstructorUid`.
 *
 * The governing constraint for a class is that this must not change *who* can
 * reach it. Access used to run through firestore.rules matching the signed-in
 * address against `instructorEmail`, so whoever owns that address is who had
 * access - which is why a resolvable email wins even when the class ID says
 * someone else. Stamping the ID's uid there would hand access to a second
 * person, and a backfill is the wrong place to do that.
 *
 * The class ID is the fallback rather than the primary source, but it is the
 * more *durable* record: the portal names a class `${uid}-${n}` and the rules
 * only allow an instructor to create one under their own uid, so the ID
 * survives the email going stale. That is exactly the case this migration
 * exists for - an instructor changed their account email, and the stored
 * address now resolves to nobody - so recovering the owner from the ID
 * restores access that has already been silently lost.
 *
 * Note the two sources legitimately disagree in a case that isn't corruption:
 * any instructor who saves a class overwrites `instructorEmail` with their
 * own, so a class created by A and last saved by co-instructor B records B.
 * That is pre-existing app behaviour; this only reports it.
 *
 * A sub request takes the same precedence for a different reason: its
 * `originalInstructorEmail` is a copy of its class's `instructorEmail` at the
 * time it was filed, and `originalInstructorUid` means that same person - the
 * class's instructor of record - so the address is the more faithful record,
 * and the class ID at the front of the request's own ID the fallback.
 */
async function resolvePrimaryInstructorUid(
  classId: string | null,
  storedEmail: unknown,
  emailField: string,
): Promise<Resolution> {
  const email = normalizeEmail(storedEmail)
  const idUid = classId ? instructorUidFromClassId(classId) : null

  if (email) {
    const byEmail = await lookup.uidForEmail(email)
    if ('uid' in byEmail) {
      return {
        uid: byEmail.uid,
        note:
          idUid && idUid !== byEmail.uid
            ? `via email - class ID says ${idUid}; keeping the address's owner`
            : undefined,
      }
    }
    // Falls through to the class ID: no account owns that address any more.
  }

  if (idUid && (await lookup.uidExists(idUid))) {
    return {
      uid: idUid,
      note: email
        ? `via class ID - ${email} resolves to nobody`
        : `via class ID - no ${emailField} on the document`,
    }
  }

  if (idUid) return { reason: `class ID uid ${idUid} has no account either` }
  return {
    reason: email
      ? `no account for ${email}, and the class ID has no uid prefix`
      : `no ${emailField} and no uid prefix in the class ID`,
  }
}

async function backfillClasses(semesterId: string) {
  const path = semesterCollectionPath(semesterId, 'classes')
  const snapshot = await db.collection(path).get()
  const toUpdate = snapshot.docs.filter(
    (doc) =>
      classNeedsCoInstructorBackfill(doc.data(), { dropLegacyField }) ||
      classNeedsInstructorUidBackfill(doc.data()) ||
      needsEmailFieldWork(doc.data(), classEmailFields, ctx),
  )
  const result = { ...emptyTally(), dropped: 0, ownerless: 0 }

  if (toUpdate.length === 0) {
    console.log(`  ${path}: ${snapshot.size} docs, none need backfilling.`)
    return result
  }

  console.log(
    `  ${path}: ${toUpdate.length}/${snapshot.size} docs still carry legacy ` +
      `co-instructor, instructor-uid or address state.`,
  )

  const planned: PlannedWrite[] = []

  for (const doc of toUpdate) {
    const data = doc.data()
    const where = `${semesterId}/${doc.id}`
    const emails = parseLegacyOtherInstructorEmails(data.otherInstructorEmails)
    const resolvedUids: string[] = []

    for (const email of emails) {
      const resolution = await resolveAcceptedInstructor(email, semesterId)
      if ('uid' in resolution) {
        resolvedUids.push(resolution.uid)
      } else {
        // Logged individually and never summarised away: each of these is a
        // real person who was listed as teaching a class and will stop being
        // able to edit it, and somebody has to decide whether that is right.
        result.dropped += 1
        console.log(`    DROPPED ${where}: ${email} (${resolution.reason})`)
      }
    }

    const { update, summary, outcomes } = await planEmailFields(
      lookup,
      data,
      classEmailFields,
      {
        ...ctx,
        resolveUid: {
          instructorUid: () =>
            resolvePrimaryInstructorUid(
              doc.id,
              data.instructorEmail,
              'instructorEmail',
            ),
        },
      },
    )
    const counts = reportOutcomes(where, outcomes, ctx)
    result.stamped += counts.stamped
    result.stripped += counts.stripped
    result.unresolved += counts.unresolved

    const [{ outcome: primary }] = outcomes
    if (!primary.stamp && storedUid(data, 'instructorUid') === null) {
      // Not fatal, and not a blocker for retiring the rules clause either:
      // a class only reaches this branch when its instructorEmail is absent
      // or owned by no account, so the clause already granted nobody access
      // to it. See notes/EMAIL_TO_UID_AUDIT.md section 9. One with an address
      // was just flagged UNRESOLVED; this reports the ones with none.
      result.ownerless += 1
      if (primary.email === null) {
        console.log(`    NO OWNER ${where}: ${primary.unresolved}`)
      }
    }

    const existing = Array.isArray(data.otherInstructorUids)
      ? (data.otherInstructorUids as string[])
      : []
    const uids = mergeCoInstructorUids(existing, resolvedUids)
    const changesUids =
      uids.length !== existing.length ||
      uids.some((uid, i) => uid !== existing[i])
    if (changesUids) {
      update.otherInstructorUids = uids
      summary.unshift(`otherInstructorUids -> [${uids.join(', ')}]`)
    }
    if (dropLegacyField && typeof data.otherInstructorEmails === 'string') {
      update.otherInstructorEmails = ctx.deleteField
      summary.push('removing otherInstructorEmails')
    }

    // A class whose addresses resolve to nothing has already been reported
    // above and has nothing left to write. Skipping it keeps re-runs from
    // issuing a no-op update per document, and keeps the count at the end
    // honest about how much this run actually accomplished - which matters
    // when the count is what tells you whether the migration is finished.
    if (Object.keys(update).length === 0) continue

    planned.push({ id: doc.id, ref: doc.ref, update, summary })
  }

  result.count = planned.length
  await applyPlannedWrites(ctx, planned)
  return result
}

function backfillSubRequests() {
  return backfillEmailFields(
    ctx,
    subRequestsCollection,
    subRequestEmailFields,
    {
      resolveUid: (docId, data) => ({
        originalInstructorUid: () =>
          resolvePrimaryInstructorUid(
            classIdFromSubRequestId(docId),
            data.originalInstructorEmail,
            'originalInstructorEmail',
          ),
      }),
      // The class ID in the request's own ID needs no address to go on.
      alsoNeedsWork: (data) =>
        storedUid(data, 'originalInstructorUid') === null,
    },
  )
}

async function main() {
  const semesters = (collectionsList as { id: string; name: string }[]).map(
    (s) => s.id,
  )
  console.log(
    `${isDryRun ? '[DRY RUN] ' : ''}Backfilling class instructor uids across ` +
      `${semesters.length} semester(s): ${semesters.join(', ')}; and ${subRequestsCollection}`,
  )
  console.log(
    stripEmails
      ? 'Phase 3: stamping uids, removing otherInstructorEmails, and removing every ' +
          `address a live account's uid backs${stripUnresolved ? ' - and, with --strip-unresolved, the ones none does' : ''}.\n`
      : dropLegacyField
        ? 'Phase 2: stamping uids AND removing the legacy otherInstructorEmails field.\n'
        : 'Phase 1: stamping uids only, leaving every address in place ' +
          '(pass --drop-legacy-field once the apps are deployed).\n',
  )

  const classTotals = emptyTally()
  let totalDropped = 0
  let totalOwnerless = 0
  for (const semesterId of semesters) {
    console.log(`\nSemester ${semesterId}:`)
    const result = await backfillClasses(semesterId)
    addTally(classTotals, result)
    totalDropped += result.dropped
    totalOwnerless += result.ownerless
  }

  console.log('\nSub requests:')
  const subRequestTotals = await backfillSubRequests()

  const totals = emptyTally()
  addTally(totals, classTotals)
  addTally(totals, subRequestTotals)
  console.log(
    `\n${isDryRun ? '[DRY RUN] Would update' : 'Updated'} ${classTotals.count} class document(s) ` +
      `across ${semesters.length} semester(s) and ${subRequestTotals.count} sub request(s): ` +
      `${totals.stamped} uid(s) stamped, ${totals.stripped} address(es) removed.`,
  )
  if (totalDropped > 0) {
    console.log(
      `${totalDropped} co-instructor address(es) were dropped - see the DROPPED lines above. ` +
        `Each is somebody who was listed on a class but is not an accepted instructor for ` +
        `that semester; check with gbSTEM leadership before treating this as done.`,
    )
  }
  if (totalOwnerless > 0) {
    console.log(
      `${totalOwnerless} class(es) could not be given an instructorUid - see the NO OWNER ` +
        `and UNRESOLVED instructorEmail lines above. This did NOT block retiring the rules ` +
        `email fallback: a class lands here only when its instructorEmail is missing or ` +
        `owned by no account, so the fallback granted nobody access to it. See ` +
        `notes/EMAIL_TO_UID_AUDIT.md section 9.`,
    )
  }
  const unresolved = unresolvedSummary(totals.unresolved, ctx)
  if (unresolved) console.log(unresolved)
}

main().catch((err) => {
  console.error('Backfill script failed:', err)
  process.exit(1)
})
