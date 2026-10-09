// backfill-interview-scheduling.ts - Brings Fall 2026's data up to the
// interview scheduling rule in #lib/helpers/setInterviewTimes
// (interviewIneligibility): an applicant can be given an interview only while
// submitted, with no interview booked, and not finally decided.
//
// Three steps, all against the current semester:
//
//   1. Interview time requests move from the top-level `interviewTimeRequests`
//      collection to `semesters/{current}/interviewTimeRequests`, under the
//      same ids. A request missing its `uid` field gets the uid its
//      `${uid}-${date}` id was built from; one whose id yields none is flagged
//      UNRESOLVED and not copied. Requests dated before this cycle's
//      applications opened belong to an earlier semester and are flagged
//      STALE, not copied. With --delete-root, every root request that was
//      copied (or is stale) is then deleted; run that only once the new code
//      is deployed and a dry run shows nothing UNRESOLVED.
//   2. Each application with a decision document gets `meta.decisionType`, a
//      copy of that document's `type` (null when it has none), as
//      /api/decision now writes it.
//   3. Report only, no writes: every undecided application whose
//      `meta.interview` disagrees with its slots - true without a booked,
//      unmissed slot naming it, or false with one - and every slot whose
//      status isn't one the app knows. Each is for a human to resolve by hand
//      in /interviews. Decided applicants are only counted: once decided, the
//      flag no longer affects scheduling - judged by the decision types step
//      2 found, so a dry run reports the same as a real one.
//
// Usage:
//   npx tsx scripts/backfill-interview-scheduling.ts --dry-run
//   npx tsx scripts/backfill-interview-scheduling.ts
//   npx tsx scripts/backfill-interview-scheduling.ts --delete-root
//   ... --production    Target production instead of the emulator
//
// Keep a log of each production run alongside the others:
//   npx tsx scripts/backfill-interview-scheduling.ts --production --dry-run \
//     | tee ../backfill-logs/backfill-interview-scheduling-dry.log
//
// Idempotent: a document already in its target state is left alone, so
// re-running after a partial failure is safe.
import admin from 'firebase-admin'
import type {} from '../src/data.d.ts'
import {
  applicationsCollection,
  currentSemester,
  decisionsCollection,
  interviewTimeRequestsCollection,
  interviewTimesCollection,
  semesterDates,
} from '../src/lib/data/collections'
import { slotRequestUid } from '../src/lib/data/docIds'
import { isFinalDecision } from '../src/lib/helpers/setInterviewTimes'
import { toDate } from '../src/lib/shared/timestamps'

/** Where requests lived before they were scoped to a semester. */
const ROOT_REQUESTS = 'interviewTimeRequests'
const KNOWN_SLOT_STATUSES = new Set(['available', 'pending', 'missed'])

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')
const deleteRoot = args.includes('--delete-root')

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
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gbstem'
  console.log(
    `Connecting to the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST} ` +
      `(project ${process.env.GCLOUD_PROJECT})`,
  )
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT })
}

const db = admin.firestore()
const verb = isDryRun ? 'would' : 'did'

/** When this cycle's applications opened; a request before it is stale. */
const cycleStart = new Date(
  Math.min(
    new Date(semesterDates.newInstructorAppsOpen).getTime(),
    new Date(semesterDates.returningInstructorAppsOpen).getTime(),
  ),
)

async function moveRequests() {
  console.log(
    `\n== 1. ${ROOT_REQUESTS} -> ${interviewTimeRequestsCollection}` +
      ` (requests from ${cycleStart.toDateString()} on)`,
  )
  const root = await db.collection(ROOT_REQUESTS).get()
  let copied = 0
  let alreadyCopied = 0
  let stale = 0
  let unresolved = 0
  const deletable: admin.firestore.DocumentReference[] = []

  for (const snap of root.docs) {
    const data = snap.data()
    const date = toDate(data.date)
    if (Number.isNaN(date.getTime()) || date < cycleStart) {
      console.log(
        `  STALE       ${snap.id} (${data.date ? date.toISOString() : 'no date'})`,
      )
      stale++
      deletable.push(snap.ref)
      continue
    }
    const uid: string = data.uid || slotRequestUid(snap.id) || ''
    if (!uid) {
      console.log(`  UNRESOLVED  ${snap.id}: no uid field, and none in its id`)
      unresolved++
      continue
    }
    const target = db.doc(`${interviewTimeRequestsCollection}/${snap.id}`)
    const request = {
      uid,
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      date: admin.firestore.Timestamp.fromDate(date),
    }
    const existing = await target.get()
    if (existing.exists && existing.data()?.uid === uid) {
      alreadyCopied++
    } else {
      console.log(
        `  COPY        ${snap.id} (${request.firstName} ${request.lastName}, ${date.toISOString()})` +
          (data.uid ? '' : ' - uid from its id'),
      )
      if (!isDryRun) await target.set(request)
      copied++
    }
    deletable.push(snap.ref)
  }

  console.log(
    `  ${root.size} root requests: ${verb} copy ${copied}, ${alreadyCopied} already copied, ` +
      `${stale} stale, ${unresolved} unresolved`,
  )
  if (deleteRoot) {
    if (unresolved > 0) {
      console.log(
        `  NOT deleting root requests: resolve the ${unresolved} UNRESOLVED first.`,
      )
    } else {
      for (const ref of deletable) {
        if (!isDryRun) await ref.delete()
      }
      console.log(`  ${verb} delete ${deletable.length} root requests`)
    }
  }
}

/** Copies each decision's type to its application; returns them by id. */
async function copyDecisionTypes(): Promise<Map<string, Data.Decision | null>> {
  console.log(`\n== 2. ${decisionsCollection}.type -> meta.decisionType`)
  const decisions = await db.collection(decisionsCollection).get()
  let updated = 0
  let current = 0
  let orphaned = 0
  const types = new Map<string, Data.Decision | null>()
  for (const decision of decisions.docs) {
    const type = decision.data().type ?? null
    types.set(decision.id, type)
    const appRef = db.doc(`${applicationsCollection}/${decision.id}`)
    const app = await appRef.get()
    if (!app.exists) {
      console.log(
        `  ORPHANED    decision ${decision.id} (${type}): no application`,
      )
      orphaned++
      continue
    }
    if ((app.data()?.meta?.decisionType ?? null) === type) {
      current++
      continue
    }
    console.log(`  SET         ${decision.id}: decisionType = ${type}`)
    if (!isDryRun) await appRef.update({ 'meta.decisionType': type })
    updated++
  }
  console.log(
    `  ${decisions.size} decisions: ${verb} set ${updated}, ${current} already current, ` +
      `${orphaned} without an application`,
  )
  return types
}

async function auditInterviewFlags(
  decisionTypes: Map<string, Data.Decision | null>,
) {
  console.log(
    `\n== 3. Audit: meta.interview against ${interviewTimesCollection}`,
  )
  const [slots, applications] = await Promise.all([
    db.collection(interviewTimesCollection).get(),
    db.collection(applicationsCollection).get(),
  ])
  const booked = new Map<string, string[]>()
  for (const slot of slots.docs) {
    const data = slot.data()
    if (!KNOWN_SLOT_STATUSES.has(data.interviewSlotStatus)) {
      console.log(
        `  STATUS      slot ${slot.id}: unknown status "${data.interviewSlotStatus}"`,
      )
    }
    if (data.intervieweeId && data.interviewSlotStatus !== 'missed') {
      booked.set(data.intervieweeId, [
        ...(booked.get(data.intervieweeId) ?? []),
        slot.id,
      ])
    }
  }

  let mismatches = 0
  let decidedMismatches = 0
  for (const app of applications.docs) {
    const meta = app.data().meta ?? {}
    const uid: string = meta.uid || app.id
    const slotIds = booked.get(uid) ?? []
    const disagrees = Boolean(meta.interview) !== slotIds.length > 0
    if (disagrees && isFinalDecision(decisionTypes.get(app.id))) {
      decidedMismatches++
    } else if (disagrees) {
      console.log(
        `  MISMATCH    ${app.id}: meta.interview is ${Boolean(meta.interview)}, ` +
          (slotIds.length
            ? `but slots ${slotIds.join(', ')} name them`
            : 'but no booked slot names them'),
      )
      mismatches++
    } else if (slotIds.length > 1) {
      console.log(`  DOUBLE      ${app.id}: booked on ${slotIds.join(', ')}`)
      mismatches++
    }
  }
  console.log(
    `  ${applications.size} applications, ${slots.size} slots: ${mismatches} to resolve by hand, ` +
      `${decidedMismatches} more already decided`,
  )
}

async function main() {
  console.log(
    `Semester ${currentSemester}${isDryRun ? ' - DRY RUN, nothing is written' : ''}`,
  )
  await moveRequests()
  const decisionTypes = await copyDecisionTypes()
  await auditInterviewFlags(decisionTypes)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
