// remove-user-document-roles.ts - Deletes the `role` field from every `users`
// document.
//
// A user's role is the Auth custom claim. `users/{uid}` used to carry a copy
// of it "for display", and that copy was never anything but a hazard: nothing
// kept it in step with the claim, 521 production accounts once had the two
// disagreeing, and portal's UI read the copy while its API gates read the
// claim - so those instructors saw instructor pages that every instructor API
// route then refused. The only reliable fix for a second copy is to not have
// one. Neither site writes the field any more and nothing reads it; this
// removes what is already stored.
//
// No claim is consulted or changed. That is safe because the audit this
// replaces, backfill-user-role-claims.ts, came back clean against production
// on 2026-09-11: every account whose document named a role already carried a
// matching claim, so no document was the only record of anyone's role.
//
// Usage:
//   npx tsx scripts/remove-user-document-roles.ts --dry-run
//   npx tsx scripts/remove-user-document-roles.ts
//   npx tsx scripts/remove-user-document-roles.ts --dry-run --production
//   npx tsx scripts/remove-user-document-roles.ts --production
//
// --production requires FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and
// FIREBASE_PROJECT_ID, or GOOGLE_APPLICATION_CREDENTIALS, already set in the
// environment - nothing is loaded from an .env file by this script.
//
// Run it after both sites are deployed: until then an old build's signup still
// writes the field. The firestore.rules change can go out before or after -
// the update rule only looks at the fields a write changes, so an account
// whose document still has a `role` can rename itself either way.
//
// Idempotent: only documents that still carry the field are written, so a
// second run after a partial failure is safe, and a second run that finds
// nothing is the check that the first one finished.
import admin from 'firebase-admin'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')

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
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        }
      : undefined,
  )
} else {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gbstem'
  console.log('Connecting to Firebase emulators at:')
  console.log(`- Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}`)
  console.log(`- Project ID: ${process.env.GCLOUD_PROJECT}\n`)
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT })
}

const db = admin.firestore()

async function main() {
  console.log(
    isDryRun
      ? 'DRY RUN: no documents will be written.\n'
      : 'Removing `role` from users documents.\n',
  )

  // select() fetches only the one field, not every name in the collection.
  const snapshot = await db.collection('users').select('role').get()
  const withRole = snapshot.docs.filter(
    (snap) => snap.get('role') !== undefined,
  )

  console.log(
    `Scanned ${snapshot.size} users document(s); ${withRole.length} carry a role.`,
  )

  if (!withRole.length) {
    console.log('\nDone. Nothing to remove.')
    return
  }

  if (isDryRun) {
    const counts = new Map<string, number>()
    for (const snap of withRole) {
      const role = String(snap.get('role'))
      counts.set(role, (counts.get(role) ?? 0) + 1)
    }
    for (const [role, count] of counts) {
      console.log(`   ${role}: ${count}`)
    }
    console.log('\nDRY RUN: nothing was written.')
    return
  }

  let removed = 0
  let failed = 0
  const writer = db.bulkWriter()
  writer.onWriteError((err) => {
    // A document deleted between the read and the write fails with NOT_FOUND,
    // which is fine - there is no field left to remove. Anything else is
    // retried a few times before it counts as a failure.
    if (err.code === admin.firestore.GrpcStatus.NOT_FOUND) return false
    if (err.failedAttempts < 3) return true
    console.error(`   FAILED ${err.documentRef.id}:`, err.message)
    return false
  })
  for (const snap of withRole) {
    // update(), not set(merge): it must never recreate a document that was
    // deleted after the read above.
    writer
      .update(snap.ref, { role: admin.firestore.FieldValue.delete() })
      .then(() => {
        removed += 1
      })
      .catch((err) => {
        if (err.code !== admin.firestore.GrpcStatus.NOT_FOUND) failed += 1
      })
  }
  await writer.close()

  console.log(
    `\nRemoved the field from ${removed} document(s), ${failed} failure(s).`,
  )
  if (failed) {
    console.log('Re-run to retry the failures.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Removal failed:', err)
  process.exit(1)
})
