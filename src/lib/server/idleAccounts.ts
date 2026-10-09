import { adminAuth } from '$lib/server/firebase'
import type { UserRecord } from 'firebase-admin/auth'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long an account may go unused before its email verification is reset.
 * Volunteers (admins, reviewers, instructors) can read other people's
 * applications or registrations, so they get the short window; a parent
 * (`student` role) reaches only their own family's data and returns a
 * semester or a year later, so gets two years. A role not listed here (an
 * account mid-signup, say) is left alone.
 */
export const IDLE_LIMIT_DAYS: Record<string, number> = {
  admin: 180,
  reviewer: 180,
  instructor: 180,
  student: 730,
}

/** Accounts reset at once: each takes two Auth calls, so keep it modest. */
const CONCURRENCY = 10

/**
 * Most accounts one run resets. Each reset is an Auth account modification,
 * and the first production run, which reset the whole backlog at once,
 * exhausted the project's Auth modification quota. The rest wait for later
 * runs, longest idle first, so a weekly run clears a backlog in a few weeks.
 */
export const MAX_RESETS_PER_RUN = 100

/**
 * When the account was last in use, in epoch milliseconds: the latest of its
 * last ID-token refresh, last sign-in and creation.
 *
 * `lastRefreshTime` is what makes this honest. The browser keeps a person
 * signed in, so someone who uses the site every week may not have entered a
 * password (`lastSignInTime`, the console's "Signed in" column) in a year.
 * The token refreshes about hourly while a page is open, and it is absent on
 * an account that never refreshed one, hence the other two.
 */
export function lastActiveMs(user: UserRecord): number {
  const times = [
    user.metadata.lastRefreshTime,
    user.metadata.lastSignInTime,
    user.metadata.creationTime,
  ]
    .map((time) => (time ? Date.parse(time) : NaN))
    .filter((ms) => !Number.isNaN(ms))
  return times.length > 0 ? Math.max(...times) : 0
}

/** Whether this account is verified, in a known role, and past its window. */
export function isIdle(user: UserRecord, now: Date): boolean {
  if (!user.emailVerified) return false
  const role = user.customClaims?.role
  const limitDays = typeof role === 'string' ? IDLE_LIMIT_DAYS[role] : undefined
  if (limitDays === undefined) return false
  return now.getTime() - lastActiveMs(user) > limitDays * DAY_MS
}

export type IdleResetSummary = {
  scanned: number
  idle: number
  reset: number
  failed: number
  /** Idle accounts left for a later run by MAX_RESETS_PER_RUN. */
  deferred: number
  dryRun: boolean
}

/**
 * Resets `emailVerified` on every idle account (see `isIdle`), so that the
 * person must press "Send verification email" on their profile and open the
 * link before `firestore.rules` and the API helpers let them read or write
 * anything again. Refresh tokens are revoked as well: Firestore reads the
 * `email_verified` claim from the ID token, which would otherwise keep
 * saying `true` for up to an hour, and a revoked token also ends any
 * session cookie (hooks.server.ts checks for revocation).
 *
 * At most MAX_RESETS_PER_RUN accounts are attempted, longest idle first; the
 * rest are counted as deferred and picked up by later runs. One account
 * failing doesn't stop the rest; it is counted, logged by uid (never email),
 * and retried by the next run since it is still idle.
 */
export async function resetIdleVerification({
  now = new Date(),
  dryRun = false,
}: { now?: Date; dryRun?: boolean } = {}): Promise<IdleResetSummary> {
  const summary: IdleResetSummary = {
    scanned: 0,
    idle: 0,
    reset: 0,
    failed: 0,
    deferred: 0,
    dryRun,
  }

  const idle: UserRecord[] = []
  let pageToken: string | undefined
  do {
    const page = await adminAuth.listUsers(1000, pageToken)
    pageToken = page.pageToken
    summary.scanned += page.users.length
    idle.push(...page.users.filter((user) => isIdle(user, now)))
  } while (pageToken)
  summary.idle = idle.length

  const batch = idle
    .sort((a, b) => lastActiveMs(a) - lastActiveMs(b))
    .slice(0, MAX_RESETS_PER_RUN)
  summary.deferred = idle.length - batch.length
  if (dryRun) return summary

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(
      batch.slice(i, i + CONCURRENCY).map(async ({ uid }) => {
        try {
          await adminAuth.updateUser(uid, { emailVerified: false })
          await adminAuth.revokeRefreshTokens(uid)
          summary.reset++
        } catch (err) {
          summary.failed++
          console.error(`[idleAccounts] could not reset ${uid}:`, err)
        }
      }),
    )
  }

  return summary
}
