// archive-past-sub-requests.ts - Moves every top-level `subRequests` document
// from a semester before the current one to `semesters/{id}/subRequests`,
// under the same id, stamped with that `semester`.
//
// A sub request's id embeds its class id, and class ids repeat every
// semester, so a past semester's request left at the top level blocks this
// semester's request for the same class and session. The current semester's
// requests stay where they are, since every route still reads them there.
//
// Sub requests carry no semester, so it is guessed from `dateOfClass` by
// scripts/lib/semesterHeuristic (Jan 1 - Jul 15 Spring, Jul 16 - Dec 31
// Fall). That is best effort, for keeping past trends rather than losing
// them. A request with no readable date is reported UNDATED and left alone.
//
// Each move is one transaction - the archived copy written and the original
// deleted together - so no request is ever in both places or neither. A
// request whose archived copy already exists and matches is the remains of
// an interrupted run, and only its original is deleted; one that differs is
// reported CONFLICT and left alone for a human.
//
// Usage:
//   npx tsx scripts/archive-past-sub-requests.ts --dry-run
//   npx tsx scripts/archive-past-sub-requests.ts
//   ... --production    Target production instead of the emulator
//
// Keep a log of each production run alongside the others:
//   npx tsx scripts/archive-past-sub-requests.ts --production --dry-run \
//     | tee ../backfill-logs/archive-past-sub-requests-dry.log
//
// Idempotent: a re-run finds nothing left to move. Re-run it after every
// semester rollover, once the new `suffix` is deployed, to archive the
// semester that just ended.
import admin from 'firebase-admin'
import { isEqual } from 'lodash-es'
import {
  currentSemester,
  semesterCollectionPath,
} from '../src/lib/data/collections'
import { SubRequestStatus } from '../src/lib/data/helpers/SubRequestStatus'
import { toDateOrNull } from '../src/lib/shared/timestamps'
import { compareSemesters, semesterForDate } from './lib/semesterHeuristic'

const ROOT_REQUESTS = 'subRequests'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')

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
const verb = isDryRun ? 'would move' : 'moved'

type Outcome = 'moved' | 'finished' | 'conflict' | 'gone'

/**
 * Moves one request to `targetPath` in a transaction, re-reading both
 * documents so a request changed since the scan is moved as it is now.
 */
async function archive(
  source: admin.firestore.DocumentReference,
  targetPath: string,
  semester: string,
): Promise<Outcome> {
  const target = db.doc(targetPath)
  return db.runTransaction(async (transaction) => {
    const [sourceSnap, targetSnap] = await transaction.getAll(source, target)
    if (!sourceSnap.exists) return 'gone'
    const archived = { ...sourceSnap.data(), semester }
    if (targetSnap.exists) {
      if (!isEqual(targetSnap.data(), archived)) return 'conflict'
      if (!isDryRun) transaction.delete(source)
      return 'finished'
    }
    if (!isDryRun) {
      transaction.set(target, archived)
      transaction.delete(source)
    }
    return 'moved'
  })
}

async function main() {
  console.log(
    `Current semester ${currentSemester}; archiving ${ROOT_REQUESTS} from before it` +
      (isDryRun ? ' - DRY RUN, nothing is written' : ''),
  )
  const root = await db.collection(ROOT_REQUESTS).get()
  const movedBySemester: Record<string, number> = {}
  let kept = 0
  let undated = 0
  let finished = 0
  let conflicts = 0
  let gone = 0

  for (const snap of root.docs) {
    const data = snap.data()
    const date = toDateOrNull(data.dateOfClass)
    if (!date) {
      console.log(`  UNDATED     ${snap.id}`)
      undated++
      continue
    }
    const semester = semesterForDate(date)
    if (compareSemesters(semester, currentSemester) >= 0) {
      kept++
      continue
    }

    const targetPath = `${semesterCollectionPath(semester, ROOT_REQUESTS)}/${snap.id}`
    const outcome = await archive(snap.ref, targetPath, semester)
    if (outcome === 'conflict') {
      console.log(
        `  CONFLICT    ${snap.id}: ${targetPath} already exists and differs`,
      )
      conflicts++
    } else if (outcome === 'gone') {
      console.log(`  GONE        ${snap.id}: deleted since the scan`)
      gone++
    } else if (outcome === 'finished') {
      console.log(`  FINISHED    ${snap.id}: already at ${targetPath}`)
      finished++
    } else {
      movedBySemester[semester] = (movedBySemester[semester] ?? 0) + 1
      // Never resolved while its semester ran; archiving doesn't change
      // that, so it is listed for anyone checking a substitute's hours.
      if (data.subRequestStatus !== SubRequestStatus.NoSubstituteNeeded) {
        console.log(
          `  OPEN        ${snap.id} -> ${semester} (${data.subRequestStatus ?? 'no status'}, ${date.toISOString()})`,
        )
      }
    }
  }

  console.log('')
  for (const semester of Object.keys(movedBySemester).sort(compareSemesters)) {
    console.log(`  ${semester}: ${verb} ${movedBySemester[semester]}`)
  }
  console.log(
    `  ${root.size} top-level requests: ${kept} kept for ${currentSemester} or later, ` +
      `${finished} interrupted moves finished, ${undated} undated, ` +
      `${conflicts} conflicts, ${gone} gone`,
  )
  if (undated || conflicts) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
