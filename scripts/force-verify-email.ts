// force-verify-email.ts - Manually mark an account's email address as verified.
//
// Why this exists: signup sends a Firebase verification link (see
// src/routes/api/verifyEmail/+server.ts), and some receiving mail systems file
// that message somewhere the recipient never looks - not the spam folder, just a
// tab/rule/quarantine they don't check. The account is then stuck: every route under
// (signedIn)/(emailVerified) bounces them, because +layout.server.ts gates on
// locals.user.emailVerified, which hooks.server.ts reads straight off the Firebase
// Auth user record. There is no Firestore mirror of this flag and no `firebase` CLI
// command for it, so the Admin SDK is the only lever.
//
// Read this before using it: setting emailVerified is asserting "this person controls
// this address" without the proof the email round-trip normally provides. Only run it
// for someone whose identity you've confirmed some other way (they're in front of you,
// you know them, you reached them on a channel that already belongs to them). Never
// run it off an unauthenticated request - "please verify my account" arriving by email
// is exactly the shape a takeover attempt has.
//
// Usage:
//   npx tsx scripts/force-verify-email.ts alice@example.com [more@example.com ...]
//   npx tsx scripts/force-verify-email.ts --dry-run alice@example.com
//   npx tsx scripts/force-verify-email.ts --production alice@example.com
//   npx tsx scripts/force-verify-email.ts --uid <uid>          Look up by uid instead
//
// --production requires FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and
// FIREBASE_PROJECT_ID (or GOOGLE_APPLICATION_CREDENTIALS) already in the environment -
// this script loads no .env file of its own. The usual invocation is:
//
//   source .env.local.prod.sh && npx tsx scripts/force-verify-email.ts --production a@b.com
//
// Idempotent: an account that is already verified is reported and skipped.
//
// After a real run, tell the person to sign out and sign back in. The server side picks
// the change up on their very next request, but the browser is holding a Firebase client
// user object and ID token minted while they were unverified, so Nav.svelte and friends
// keep rendering the unverified state until the token refreshes. The self-heal in
// (signedIn)/(emailVerified)/+layout.svelte can't do it for them - that layout never
// mounts, since its own +layout.server.ts redirects them away first. A fresh sign-in is
// the reliable fix.
import admin from 'firebase-admin'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isProduction = args.includes('--production')
const byUid = args.includes('--uid')
const identifiers = args.filter((arg) => !arg.startsWith('--'))

if (identifiers.length === 0) {
  console.error(
    'Usage: npx tsx scripts/force-verify-email.ts [--dry-run] [--production] [--uid] ' +
      '<email-or-uid> [...]',
  )
  process.exit(1)
}

if (isProduction) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error(
      'Refusing to run with --production while FIREBASE_AUTH_EMULATOR_HOST is set in ' +
        'the environment. Unset it, or drop --production to target the emulator instead.',
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
        'variables src/lib/server/firebase.ts uses, e.g. sourced from .env.local.prod.sh), ' +
        'or GOOGLE_APPLICATION_CREDENTIALS.',
    )
    process.exit(1)
  }
  console.log(
    `Connecting to PRODUCTION Firebase Auth project ` +
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
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gbstem'
  console.log('Connecting to the Firebase Auth emulator at:')
  console.log(`- Auth: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`)
  console.log(`- Project ID: ${process.env.GCLOUD_PROJECT}\n`)
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT })
}

const auth = admin.auth()

async function verifyOne(identifier: string) {
  let user: admin.auth.UserRecord
  try {
    user = byUid
      ? await auth.getUser(identifier)
      : await auth.getUserByEmail(identifier)
  } catch (err) {
    // auth/user-not-found is the ordinary case (typo, or the account was never
    // created because signup failed part way); anything else is worth seeing whole.
    const code = (err as { code?: string }).code
    if (code === 'auth/user-not-found') {
      console.log(`  ${identifier}: no such account - skipped.`)
    } else {
      console.log(`  ${identifier}: lookup failed (${code ?? err}) - skipped.`)
    }
    return false
  }

  const role =
    user.customClaims && 'role' in user.customClaims
      ? (user.customClaims.role as string)
      : '(no role claim)'
  const providers =
    user.providerData.map((p) => p.providerId).join(', ') || 'none'
  console.log(
    `  ${user.email ?? '(no email)'} [uid ${user.uid}] role=${role} ` +
      `providers=${providers} created=${user.metadata.creationTime}`,
  )

  if (user.emailVerified) {
    console.log('    already verified - nothing to do.')
    return false
  }
  if (isDryRun) {
    console.log('    [DRY RUN] would set emailVerified = true')
    return true
  }

  await auth.updateUser(user.uid, { emailVerified: true })
  // Existing ID tokens still carry email_verified: false until they expire (up to an
  // hour), and the session cookie the SvelteKit app issues is independent of that.
  // Revoking forces the client to re-authenticate and pick up the new state; the
  // person has to sign in again, which is the same thing we'd ask of them anyway.
  await auth.revokeRefreshTokens(user.uid)
  console.log(
    '    emailVerified = true; refresh tokens revoked (must sign in again).',
  )
  return true
}

async function main() {
  console.log(
    `${isDryRun ? '[DRY RUN] ' : ''}Force-verifying ${identifiers.length} ` +
      `account(s) by ${byUid ? 'uid' : 'email'}:`,
  )
  let changed = 0
  for (const identifier of identifiers) {
    if (await verifyOne(identifier)) changed += 1
  }
  console.log(
    `\n${isDryRun ? '[DRY RUN] Would verify' : 'Verified'} ${changed} of ` +
      `${identifiers.length} account(s).`,
  )
  if (changed > 0 && !isDryRun) {
    console.log(
      'Ask each person to sign out and sign back in - their browser is still holding ' +
        'a token minted while they were unverified.',
    )
  }
}

main().catch((err) => {
  console.error('force-verify-email failed:', err)
  process.exit(1)
})
