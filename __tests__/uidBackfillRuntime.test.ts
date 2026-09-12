import {
  classEmailFields,
  interviewSlotEmailFields,
} from '../scripts/lib/emailToUidTransforms'
import {
  applyPlannedWrites,
  createAuthLookup,
  planEmailField,
  planEmailFields,
  unresolvedSummary,
  type PlannedWrite,
} from '../scripts/lib/uidBackfillRuntime'

function authError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** A fake Auth holding the given email -> uid accounts. */
function fakeAuth(accounts: Record<string, string>) {
  const uids = new Set(Object.values(accounts))
  return {
    getUserByEmail: jest.fn(async (email: string) => {
      if (!accounts[email]) throw authError('auth/user-not-found')
      return { uid: accounts[email] }
    }),
    getUser: jest.fn(async (uid: string) => {
      if (!uids.has(uid)) throw authError('auth/user-not-found')
      return { uid }
    }),
  }
}

function lookupFor(accounts: Record<string, string>) {
  const auth = fakeAuth(accounts)
  // The fake returns only the uid, which is all the lookup reads.
  const lookup = createAuthLookup(
    auth as unknown as Parameters<typeof createAuthLookup>[0],
  )
  return { auth, lookup }
}

const [interviewerField] = interviewSlotEmailFields
const keep = { stripEmails: false, stripUnresolved: false }
const strip = { stripEmails: true, stripUnresolved: false }

describe('createAuthLookup', () => {
  test('resolves an address and caches it', async () => {
    const { auth, lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    expect(await lookup.uidForEmail('ada@example.com')).toEqual({
      uid: 'uid-ada',
    })
    await lookup.uidForEmail('ada@example.com')
    expect(auth.getUserByEmail).toHaveBeenCalledTimes(1)
  })

  test('explains an address no account owns', async () => {
    const { lookup } = lookupFor({})
    expect(await lookup.uidForEmail('gone@example.com')).toEqual({
      reason: 'no account for gone@example.com',
    })
  })

  // Mistaking a transient failure for a missing account would flag - or,
  // under --strip-unresolved, delete - an address that is fine.
  test('throws on anything other than a missing account', async () => {
    const { auth, lookup } = lookupFor({})
    auth.getUserByEmail.mockRejectedValueOnce(authError('auth/quota-exceeded'))
    auth.getUser.mockRejectedValueOnce(authError('auth/internal-error'))
    await expect(lookup.uidForEmail('ada@example.com')).rejects.toThrow(
      'auth/quota-exceeded',
    )
    await expect(lookup.uidExists('uid-ada')).rejects.toThrow(
      'auth/internal-error',
    )
  })

  test('reports whether a uid names an account, cached', async () => {
    const { auth, lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    expect(await lookup.uidExists('uid-ada')).toBe(true)
    expect(await lookup.uidExists('uid-gone')).toBe(false)
    await lookup.uidExists('uid-gone')
    expect(auth.getUser).toHaveBeenCalledTimes(2)
  })
})

describe('planEmailField', () => {
  test('stamps a missing uid from the address, keeping the address', async () => {
    const { lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    expect(
      await planEmailField(
        lookup,
        { interviewerEmail: ' Ada@Example.com ' },
        interviewerField,
        keep,
      ),
    ).toEqual({
      email: 'ada@example.com',
      stamp: { uid: 'uid-ada' },
      strip: false,
    })
  })

  test('flags an address no account owns', async () => {
    const { lookup } = lookupFor({})
    expect(
      await planEmailField(
        lookup,
        { interviewerEmail: 'gone@example.com' },
        interviewerField,
        keep,
      ),
    ).toEqual({
      email: 'gone@example.com',
      unresolved: 'no account for gone@example.com',
      strip: false,
    })
  })

  test('leaves a document with a uid alone when only backfilling', async () => {
    const { auth, lookup } = lookupFor({})
    expect(
      await planEmailField(
        lookup,
        { interviewerEmail: 'a@b.com', interviewerUid: 'uid-gone' },
        interviewerField,
        keep,
      ),
    ).toEqual({ email: 'a@b.com', strip: false })
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  test('uses a collection-specific resolver in place of the address', async () => {
    const { auth, lookup } = lookupFor({})
    const resolveUid = jest.fn(async () => ({
      uid: 'uid-from-id',
      note: 'from the document ID',
    }))
    const outcome = await planEmailField(
      lookup,
      { instructorEmail: 'someone@example.com' },
      classEmailFields[0],
      { ...keep, resolveUid },
    )
    expect(resolveUid).toHaveBeenCalledWith('someone@example.com')
    expect(outcome.stamp).toEqual({
      uid: 'uid-from-id',
      note: 'from the document ID',
    })
    expect(auth.getUserByEmail).not.toHaveBeenCalled()
  })

  test('strips an address whose stored uid names a live account', async () => {
    const { lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    const outcome = await planEmailField(
      lookup,
      { interviewerEmail: 'old-ada@example.com', interviewerUid: 'uid-ada' },
      interviewerField,
      strip,
    )
    expect(outcome).toEqual({ email: 'old-ada@example.com', strip: true })
  })

  // Stripping never removes an address this same run could resolve.
  test('stamps and strips in one pass', async () => {
    const { lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    expect(
      await planEmailField(
        lookup,
        { interviewerEmail: 'ada@example.com' },
        interviewerField,
        strip,
      ),
    ).toEqual({
      email: 'ada@example.com',
      stamp: { uid: 'uid-ada' },
      strip: true,
    })
  })

  test('keeps and flags an address whose stored uid names no account', async () => {
    const { lookup } = lookupFor({})
    expect(
      await planEmailField(
        lookup,
        { interviewerEmail: 'a@b.com', interviewerUid: 'uid-gone' },
        interviewerField,
        strip,
      ),
    ).toEqual({
      email: 'a@b.com',
      unresolved: 'interviewerUid uid-gone names no Auth account',
      strip: false,
    })
  })

  test('keeps an unresolvable address unless told to strip it', async () => {
    const { lookup } = lookupFor({})
    const data = { interviewerEmail: 'gone@example.com' }
    expect(
      (await planEmailField(lookup, data, interviewerField, strip)).strip,
    ).toBe(false)
    expect(
      (
        await planEmailField(lookup, data, interviewerField, {
          stripEmails: true,
          stripUnresolved: true,
        })
      ).strip,
    ).toBe(true)
  })

  test('strips a blank address without asking Auth anything', async () => {
    const { auth, lookup } = lookupFor({})
    expect(
      await planEmailField(
        lookup,
        { intervieweeEmail: '', intervieweeId: '' },
        interviewSlotEmailFields[1],
        strip,
      ),
    ).toEqual({ email: null, strip: true })
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(auth.getUserByEmail).not.toHaveBeenCalled()
  })

  test('does nothing for a field that is already gone', async () => {
    const { lookup } = lookupFor({})
    expect(
      await planEmailField(
        lookup,
        { interviewerUid: 'uid-ada' },
        interviewerField,
        strip,
      ),
    ).toEqual({ email: null, strip: false })
  })
})

describe('planEmailFields', () => {
  test('builds one update, with the delete sentinel, across every pair', async () => {
    const { lookup } = lookupFor({ 'ada@example.com': 'uid-ada' })
    const deleteField = Symbol('delete')
    const { update, summary } = await planEmailFields(
      lookup,
      {
        interviewerEmail: 'ada@example.com',
        intervieweeEmail: '',
        intervieweeId: '',
      },
      interviewSlotEmailFields,
      { ...strip, deleteField },
    )
    expect(update).toEqual({
      interviewerUid: 'uid-ada',
      interviewerEmail: deleteField,
      intervieweeEmail: deleteField,
    })
    expect(summary).toEqual([
      'interviewerUid -> uid-ada',
      'removing interviewerEmail',
      'removing intervieweeEmail',
    ])
  })

  test('routes each resolver to its own uid field', async () => {
    const { lookup } = lookupFor({ 'sub@example.com': 'uid-sub' })
    const { update } = await planEmailFields(
      lookup,
      {
        interviewerEmail: 'x@example.com',
        intervieweeEmail: 'sub@example.com',
      },
      interviewSlotEmailFields,
      {
        ...keep,
        deleteField: null,
        resolveUid: {
          interviewerUid: async () => ({ uid: 'uid-from-resolver' }),
        },
      },
    )
    expect(update).toEqual({
      interviewerUid: 'uid-from-resolver',
      intervieweeId: 'uid-sub',
    })
  })
})

describe('applyPlannedWrites', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function fakeDb() {
    const batches: { updates: unknown[]; committed: boolean }[] = []
    const db = {
      batch: jest.fn(() => {
        const record = { updates: [] as unknown[], committed: false }
        batches.push(record)
        return {
          update: (ref: unknown, update: unknown) => {
            record.updates.push({ ref, update })
          },
          commit: async () => {
            record.committed = true
          },
        }
      }),
    }
    return {
      db: db as unknown as Parameters<typeof applyPlannedWrites>[0]['db'],
      batches,
    }
  }

  function writes(n: number): PlannedWrite[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `doc-${i}`,
      ref: { id: `doc-${i}` } as unknown as PlannedWrite['ref'],
      update: { interviewerUid: `uid-${i}` },
      summary: [`interviewerUid -> uid-${i}`],
    }))
  }

  test('commits in batches no larger than Firestore allows', async () => {
    const { db, batches } = fakeDb()
    await applyPlannedWrites({ db, isDryRun: false }, writes(501))
    expect(batches.map((b) => b.updates.length)).toEqual([500, 1])
    expect(batches.every((b) => b.committed)).toBe(true)
  })

  test('writes nothing on a dry run', async () => {
    const { db, batches } = fakeDb()
    await applyPlannedWrites({ db, isDryRun: true }, writes(3))
    expect(batches).toEqual([])
    expect(console.log).toHaveBeenCalledWith(
      '    [dry-run sample] doc-0: interviewerUid -> uid-0',
    )
  })
})

describe('unresolvedSummary', () => {
  test('is silent when nothing is unresolved', () => {
    expect(unresolvedSummary(0, strip)).toBe(null)
  })

  test('tells each mode what happened to the flagged addresses', () => {
    expect(unresolvedSummary(2, keep)).toMatch(/no uid was stamped/)
    expect(unresolvedSummary(2, strip)).toMatch(/--strip-emails keeps them/)
    expect(
      unresolvedSummary(2, { stripEmails: true, stripUnresolved: true }),
    ).toMatch(/--strip-unresolved removes them anyway/)
  })
})
