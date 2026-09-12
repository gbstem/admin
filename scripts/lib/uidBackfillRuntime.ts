// uidBackfillRuntime.ts - What the email-to-uid backfill scripts
// (backfill-class-instructor-uids.ts, backfill-interviewer-uids.ts) share
// beyond pure transforms: cached Auth lookups, planning a document's writes
// from them, and applying those writes to a collection. It reaches Auth and
// Firestore only through the objects it is handed, so the lookup and planning
// halves are unit tested against fakes.
import type { Auth } from 'firebase-admin/auth'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import {
  decideEmailStrip,
  describeUnresolved,
  needsEmailFieldWork,
  normalizeEmail,
  storedUid,
  type EmailUidField,
  type FieldOutcome,
  type Resolution,
  type UidStatus,
} from './emailToUidTransforms'

const SAMPLE_SIZE = 5 // docs shown in --dry-run output
const BATCH_LIMIT = 500 // Firestore batched-write limit

export type StripOptions = { stripEmails: boolean; stripUnresolved: boolean }

/**
 * Finds a uid for a document that has none, given its stored address. Null
 * means "nothing to go on".
 */
export type UidResolver = (email: string | null) => Promise<Resolution | null>

function authErrorCode(err: unknown): unknown {
  return typeof err === 'object' && err !== null
    ? (err as { code?: unknown }).code
    : undefined
}

/**
 * Auth lookups, cached because the same person turns up on many documents -
 * an interviewer on every slot of a semester, an instructor on every class and
 * sub request.
 *
 * Only "no such account" counts as a miss. Anything else - a quota error, a
 * dropped connection - is thrown, which aborts the run before that
 * collection's writes: mistaken for a missing account, it would flag an
 * address that is fine, and under --strip-unresolved delete it.
 */
export function createAuthLookup(
  auth: Pick<Auth, 'getUser' | 'getUserByEmail'>,
) {
  const byEmail = new Map<string, Promise<Resolution>>()
  const byUid = new Map<string, Promise<boolean>>()

  return {
    /** The uid of the account that owns `email` now, or why there is none. */
    uidForEmail(email: string): Promise<Resolution> {
      let found = byEmail.get(email)
      if (!found) {
        found = auth.getUserByEmail(email).then(
          (user): Resolution => ({ uid: user.uid }),
          (err: unknown): Resolution => {
            const code = authErrorCode(err)
            if (code === 'auth/user-not-found') {
              return { reason: `no account for ${email}` }
            }
            if (code === 'auth/invalid-email') {
              return { reason: `${email} is not a valid address` }
            }
            throw err
          },
        )
        byEmail.set(email, found)
      }
      return found
    },

    /** Whether an account with this uid exists in Auth. */
    uidExists(uid: string): Promise<boolean> {
      let found = byUid.get(uid)
      if (!found) {
        found = auth.getUser(uid).then(
          () => true,
          (err: unknown) => {
            const code = authErrorCode(err)
            if (code === 'auth/user-not-found' || code === 'auth/invalid-uid') {
              return false
            }
            throw err
          },
        )
        byUid.set(uid, found)
      }
      return found
    },
  }
}

export type AuthLookup = ReturnType<typeof createAuthLookup>

/**
 * Decides, for one address/uid pair on one document, what uid to stamp and
 * whether to strip the address.
 *
 * A missing uid is looked for first - through `resolveUid` when the collection
 * has a better source than the address, such as a uid in the document ID -
 * so stripping never removes an address whose uid this very run could have
 * recovered. Stored uids are checked against Auth only when stripping, and
 * only where there is an address to lose.
 */
export async function planEmailField(
  lookup: AuthLookup,
  data: Record<string, unknown>,
  field: EmailUidField,
  options: StripOptions & { resolveUid?: UidResolver },
): Promise<FieldOutcome> {
  const email = normalizeEmail(data[field.email])
  const outcome: FieldOutcome = { email, strip: false }
  let uid = storedUid(data, field.uid)

  if (!uid) {
    const resolution = options.resolveUid
      ? await options.resolveUid(email)
      : email
        ? await lookup.uidForEmail(email)
        : null
    if (resolution && 'uid' in resolution) {
      uid = resolution.uid
      outcome.stamp = resolution
    } else if (resolution) {
      outcome.unresolved = resolution.reason
    } else if (email) {
      outcome.unresolved = 'no uid could be found for it'
    }
  }

  if (options.stripEmails && field.email in data) {
    let status: UidStatus = 'missing'
    if (uid && email !== null) {
      // A uid this run found came from a live account; a stored one may name
      // an account deleted since it was written.
      status =
        outcome.stamp || (await lookup.uidExists(uid)) ? 'live' : 'no account'
      if (status === 'no account') {
        outcome.unresolved = `${field.uid} ${uid} names no Auth account`
      }
    }
    outcome.strip =
      decideEmailStrip(data, field.email, status, options) === 'strip'
  }

  return outcome
}

export type PlannedField = { field: EmailUidField; outcome: FieldOutcome }

/**
 * Plans every pair on a document, as the Firestore update that carries it out
 * plus a readable summary for --dry-run. `deleteField` is the caller's
 * FieldValue.delete() sentinel, passed in to keep this module free of a
 * runtime firebase-admin import.
 */
export async function planEmailFields(
  lookup: AuthLookup,
  data: Record<string, unknown>,
  fields: readonly EmailUidField[],
  options: StripOptions & {
    deleteField: unknown
    /** Resolvers by uid field name, for pairs not resolved by address. */
    resolveUid?: Partial<Record<string, UidResolver>>
  },
) {
  const update: Record<string, unknown> = {}
  const summary: string[] = []
  const outcomes: PlannedField[] = []

  for (const field of fields) {
    const outcome = await planEmailField(lookup, data, field, {
      stripEmails: options.stripEmails,
      stripUnresolved: options.stripUnresolved,
      resolveUid: options.resolveUid?.[field.uid],
    })
    outcomes.push({ field, outcome })
    if (outcome.stamp) {
      update[field.uid] = outcome.stamp.uid
      summary.push(`${field.uid} -> ${outcome.stamp.uid}`)
    }
    if (outcome.strip) {
      update[field.email] = options.deleteField
      summary.push(`removing ${field.email}`)
    }
  }

  return { update, summary, outcomes }
}

export type Tally = {
  /** Documents written, or that would be under --dry-run. */
  count: number
  stamped: number
  stripped: number
  unresolved: number
}

export const emptyTally = (): Tally => ({
  count: 0,
  stamped: 0,
  stripped: 0,
  unresolved: 0,
})

export function addTally(total: Tally, more: Tally): void {
  total.count += more.count
  total.stamped += more.stamped
  total.stripped += more.stripped
  total.unresolved += more.unresolved
}

/**
 * Logs what a document's plan found worth a human's attention, and counts it.
 * UNRESOLVED lines are printed individually and never summarised away: each
 * is an address whose owner nobody can currently name, and deciding what to do
 * with it is the point of the report.
 */
export function reportOutcomes(
  where: string,
  outcomes: PlannedField[],
  options: { stripEmails: boolean },
): Omit<Tally, 'count'> {
  const tally = { stamped: 0, stripped: 0, unresolved: 0 }
  for (const { field, outcome } of outcomes) {
    if (outcome.stamp) {
      tally.stamped += 1
      if (outcome.stamp.note) {
        console.log(
          `    NOTE ${where}: ${field.uid} -> ${outcome.stamp.uid} (${outcome.stamp.note})`,
        )
      }
    }
    if (outcome.strip) tally.stripped += 1
    const line = describeUnresolved(where, field.email, outcome, options)
    if (line) {
      tally.unresolved += 1
      console.log(`    ${line}`)
    }
  }
  return tally
}

export type PlannedWrite = {
  id: string
  ref: DocumentReference
  update: Record<string, unknown>
  summary: string[]
}

/**
 * Commits planned updates in batches, or under --dry-run prints a sample.
 *
 * update(), never set(merge): it must not recreate a document deleted after
 * the read - a sub request cancelled mid-run, say. That fails its batch, and
 * re-running picks up where this left off.
 */
export async function applyPlannedWrites(
  ctx: { db: Pick<Firestore, 'batch'>; isDryRun: boolean },
  planned: PlannedWrite[],
): Promise<void> {
  if (planned.length === 0) {
    console.log('    nothing writable here; see any lines above.')
    return
  }

  if (ctx.isDryRun) {
    for (const write of planned.slice(0, SAMPLE_SIZE)) {
      console.log(
        `    [dry-run sample] ${write.id}: ${write.summary.join(', ')}`,
      )
    }
    return
  }

  let committed = 0
  for (let i = 0; i < planned.length; i += BATCH_LIMIT) {
    const batchWrites = planned.slice(i, i + BATCH_LIMIT)
    const batch = ctx.db.batch()
    for (const write of batchWrites) {
      batch.update(write.ref, write.update)
    }
    await batch.commit()
    committed += batchWrites.length
    console.log(`    committed ${committed}/${planned.length}`)
  }
}

export type BackfillContext = StripOptions & {
  db: Firestore
  lookup: AuthLookup
  isDryRun: boolean
  deleteField: unknown
}

/**
 * Backfills uids for, and optionally strips, every address/uid pair in one
 * collection. Collections with bespoke state (classes' co-instructors) plan
 * their own documents from the pieces above instead.
 */
export async function backfillEmailFields(
  ctx: BackfillContext,
  path: string,
  fields: readonly EmailUidField[],
  options: {
    /** Per-document resolvers, for uids with a better source than the address. */
    resolveUid?: (
      docId: string,
      data: Record<string, unknown>,
    ) => Partial<Record<string, UidResolver>>
    /** Documents to look at even with no address, because `resolveUid` needs none. */
    alsoNeedsWork?: (data: Record<string, unknown>) => boolean
  } = {},
): Promise<Tally> {
  const snapshot = await ctx.db.collection(path).get()
  const toUpdate = snapshot.docs.filter(
    (doc) =>
      needsEmailFieldWork(doc.data(), fields, ctx) ||
      (options.alsoNeedsWork?.(doc.data()) ?? false),
  )
  const tally = emptyTally()

  if (toUpdate.length === 0) {
    console.log(`  ${path}: ${snapshot.size} docs, none need backfilling.`)
    return tally
  }

  console.log(
    `  ${path}: ${toUpdate.length}/${snapshot.size} docs may need a uid stamped` +
      `${ctx.stripEmails ? ' or an address removed' : ''}.`,
  )

  const planned: PlannedWrite[] = []
  for (const doc of toUpdate) {
    const data = doc.data()
    const { update, summary, outcomes } = await planEmailFields(
      ctx.lookup,
      data,
      fields,
      { ...ctx, resolveUid: options.resolveUid?.(doc.id, data) },
    )
    const counts = reportOutcomes(`${path}/${doc.id}`, outcomes, ctx)
    tally.stamped += counts.stamped
    tally.stripped += counts.stripped
    tally.unresolved += counts.unresolved
    if (Object.keys(update).length > 0) {
      planned.push({ id: doc.id, ref: doc.ref, update, summary })
    }
  }

  tally.count = planned.length
  await applyPlannedWrites(ctx, planned)
  return tally
}

/** The closing explanation of a run's UNRESOLVED lines, or null if none. */
export function unresolvedSummary(
  count: number,
  options: StripOptions,
): string | null {
  if (count === 0) return null
  const head =
    `${count} address(es) are UNRESOLVED - see those lines above. ` +
    `No live Auth account's uid backs them, `
  if (!options.stripEmails) {
    return (
      head +
      'so no uid was stamped for them. Each is the only record of who its document ' +
      'belonged to: fix what you can by hand and re-run, and decide on the rest ' +
      'before --strip-emails, which keeps them unless you add --strip-unresolved.'
    )
  }
  if (!options.stripUnresolved) {
    return (
      head +
      'so --strip-emails keeps them. Add --strip-unresolved to remove them too, ' +
      'once you have decided nobody needs to know who they were.'
    )
  }
  return head + 'and --strip-unresolved removes them anyway.'
}
