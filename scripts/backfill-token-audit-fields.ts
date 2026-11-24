// backfill-token-audit-fields.ts - Gives every signup token made before the
// audit fields existed the fields the tokens page now orders and shows by.
//
// The page orders by `createdAt`, and a Firestore orderBy silently leaves out
// documents without the field, so an un-backfilled token would vanish from
// the list entirely. For each token missing `createdAt` this sets:
//   createdAt  the document's own create time, so the order is the real one
//   createdBy  null (shown as "unknown")
//   purpose    '' (shown as a dash)
//   revokedAt, revokedBy  null
// and leaves every other field alone.
//
// Usage:
//   npx tsx scripts/backfill-token-audit-fields.ts --dry-run
//   npx tsx scripts/backfill-token-audit-fields.ts
//   ... --production    Target production instead of the emulator
//
// Keep a log of each production run alongside the others:
//   npx tsx scripts/backfill-token-audit-fields.ts --production --dry-run \
//     | tee ../backfill-logs/backfill-token-audit-fields-dry.log
//
// Idempotent: a token that already has `createdAt` is left alone, so
// re-running after a partial failure is safe.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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
  initializeApp(
    hasCertCreds
      ? {
          credential: cert({
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
  initializeApp({ projectId: process.env.GCLOUD_PROJECT })
}

const db = getFirestore()
const verb = isDryRun ? 'would update' : 'updated'

/** Firestore's limit on writes per batch. */
const BATCH_LIMIT = 500

async function main() {
  const snapshot = await db.collection('tokens').get()
  const missing = snapshot.docs.filter((doc) => doc.get('createdAt') == null)
  console.log(
    `${snapshot.size} tokens; ${missing.length} without createdAt ` +
      `(${snapshot.size - missing.length} already done).`,
  )

  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const doc of missing.slice(i, i + BATCH_LIMIT)) {
      console.log(
        `  ${verb} tokens/${doc.id}: createdAt = ` +
          doc.createTime.toDate().toISOString(),
      )
      batch.update(doc.ref, {
        createdAt: doc.createTime,
        createdBy: doc.get('createdBy') ?? null,
        purpose: doc.get('purpose') ?? '',
        revokedAt: doc.get('revokedAt') ?? null,
        revokedBy: doc.get('revokedBy') ?? null,
      })
    }
    if (!isDryRun) await batch.commit()
  }
  console.log(`Done: ${verb} ${missing.length} tokens.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
