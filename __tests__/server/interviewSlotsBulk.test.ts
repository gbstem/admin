// createOpenInterviewSlots and deleteOpenInterviewSlots: the availability
// grid's saves. Firestore is an in-memory map of path -> document, read and
// written through a transaction that supports what these two use: getAll,
// and a query on the caller's own slots.
const docs: Record<string, any> = {}
const mockTransactions = { count: 0 }

const snapshot = (path: string) => ({
  id: path.split('/').at(-1),
  ref: { path },
  exists: path in docs,
  data: () => docs[path],
})

const mockTransaction = {
  get: jest.fn(async (query: { where: [string, unknown] }) => {
    const [field, value] = query.where
    return {
      docs: Object.keys(docs)
        .filter((path) => docs[path][field] === value)
        .map(snapshot),
    }
  }),
  getAll: jest.fn(async (...refs: { path: string }[]) =>
    refs.map((ref) => snapshot(ref.path)),
  ),
  set: jest.fn((ref: { path: string }, data: any) => {
    docs[ref.path] = data
  }),
  delete: jest.fn((ref: { path: string }) => {
    delete docs[ref.path]
  }),
}
const mockAccountName = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: () => ({
      where: (field: string, _op: string, value: unknown) => ({
        where: [field, value],
      }),
    }),
    runTransaction: (fn: (t: typeof mockTransaction) => unknown) => {
      mockTransactions.count++
      return fn(mockTransaction)
    },
  },
}))
jest.mock('#lib/server/userProfile.js', () => ({
  accountName: (...args: any[]) => mockAccountName(...args),
}))
jest.mock('#lib/server/accountEmail.js', () => ({
  resolveAccountEmail: jest.fn(),
}))
jest.mock('#lib/server/email.js', () => ({ sendEmail: jest.fn() }))

import {
  currentSemester,
  interviewTimesCollection,
} from '#lib/data/collections.js'
import { interviewSlotDocId } from '#lib/data/docIds.js'
import {
  createOpenInterviewSlots,
  deleteOpenInterviewSlots,
} from '#lib/server/interviewSlots.js'

const LINK = 'https://mit.zoom.us/j/1'
const NOW = new Date('2026-10-01T12:00:00.000Z')
const WINDOW = {
  opens: new Date('2026-09-01T04:00:00.000Z'),
  closes: new Date('2026-11-01T04:00:00.000Z'),
}
const reviewer = { uid: 'rev-1', role: 'reviewer' as const }
const admin = { uid: 'admin-1', role: 'admin' as const }

const at = (iso: string) => new Date(iso)
const pathFor = (date: Date, uid = reviewer.uid) =>
  `${interviewTimesCollection}/${interviewSlotDocId(date.toISOString(), uid)}`
const slot = (date: Date, overrides: Record<string, unknown> = {}) => ({
  date,
  meetingLink: 'https://mit.zoom.us/j/old',
  interviewerName: 'Jane Doe',
  interviewerUid: reviewer.uid,
  intervieweeId: '',
  intervieweeFirstName: '',
  intervieweeLastName: '',
  interviewSlotStatus: 'available',
  ...overrides,
})

const T1 = at('2026-10-05T18:00:00.000Z')
const T2 = at('2026-10-05T18:15:00.000Z')
const T3 = at('2026-10-05T18:30:00.000Z')

beforeEach(() => {
  jest.clearAllMocks()
  mockTransactions.count = 0
  for (const key of Object.keys(docs)) delete docs[key]
  mockAccountName.mockResolvedValue('Jane Doe')
})

describe('createOpenInterviewSlots', () => {
  it("creates the caller's open slots, under their uid and profile name", async () => {
    const result = await createOpenInterviewSlots(
      reviewer,
      [T2, T1],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toEqual({
      created: 2,
      replaced: 0,
      skippedBooked: 0,
      skippedOverlap: 0,
      skippedOutside: 0,
    })
    expect(docs[pathFor(T1)]).toEqual({
      id: interviewSlotDocId(T1.toISOString(), reviewer.uid),
      date: T1,
      meetingLink: LINK,
      interviewerName: 'Jane Doe',
      interviewerUid: reviewer.uid,
      intervieweeId: '',
      intervieweeFirstName: '',
      intervieweeLastName: '',
      interviewSlotStatus: 'available',
      semester: currentSemester,
    })
    expect(docs[pathFor(T2)]).toBeDefined()
  })

  // Repainting a range is the normal workflow: it must never reopen a booking.
  it('leaves a booked slot alone, and a missed one, counting them', async () => {
    const booked = slot(T1, {
      intervieweeId: 'ada',
      intervieweeFirstName: 'Ada',
      interviewSlotStatus: 'pending',
    })
    const missed = slot(T2, {
      intervieweeId: 'bob',
      interviewSlotStatus: 'missed',
    })
    docs[pathFor(T1)] = booked
    docs[pathFor(T2)] = missed

    const result = await createOpenInterviewSlots(
      reviewer,
      [T1, T2],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toMatchObject({ created: 0, skippedBooked: 2 })
    expect(docs[pathFor(T1)]).toBe(booked)
    expect(docs[pathFor(T2)]).toBe(missed)
  })

  it('gives an open slot already at that time the new link', async () => {
    docs[pathFor(T1)] = slot(T1)

    const result = await createOpenInterviewSlots(
      reviewer,
      [T1],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toMatchObject({ created: 0, replaced: 1 })
    expect(docs[pathFor(T1)].meetingLink).toBe(LINK)
  })

  it("skips a time starting inside another of the caller's slots", async () => {
    // 4:05 from the one-slot form overlaps both the 4:00 and the 4:15 rows.
    const offGrid = at('2026-10-05T18:05:00.000Z')
    docs[pathFor(offGrid)] = slot(offGrid)
    // Someone else's slot at the same time is no conflict for the caller.
    docs[pathFor(T3, 'rev-2')] = slot(T3, { interviewerUid: 'rev-2' })

    const result = await createOpenInterviewSlots(
      reviewer,
      [T1, T2, T3],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toMatchObject({ created: 1, skippedOverlap: 2 })
    expect(docs[pathFor(T1)]).toBeUndefined()
    expect(docs[pathFor(T3)]).toBeDefined()
  })

  it("doesn't count a missed slot as an overlap", async () => {
    const offGrid = at('2026-10-05T18:05:00.000Z')
    docs[pathFor(offGrid)] = slot(offGrid, {
      intervieweeId: 'ada',
      interviewSlotStatus: 'missed',
    })

    const result = await createOpenInterviewSlots(
      reviewer,
      [T1],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toMatchObject({ created: 1, skippedOverlap: 0 })
  })

  it('drops past times and times outside the window, whatever was sent', async () => {
    const result = await createOpenInterviewSlots(
      reviewer,
      [at('2026-09-30T18:00:00.000Z'), at('2026-11-01T04:00:00.000Z'), T1, T1],
      LINK,
      WINDOW,
      NOW,
    )

    expect(result).toMatchObject({ created: 1, skippedOutside: 2 })
    expect(Object.keys(docs)).toEqual([pathFor(T1)])
  })

  it('refuses (400) a caller with no name on file, writing nothing', async () => {
    mockAccountName.mockResolvedValue('')

    await expect(
      createOpenInterviewSlots(reviewer, [T1], LINK, WINDOW, NOW),
    ).rejects.toMatchObject({ status: 400 })
    expect(docs).toEqual({})
  })

  it('splits a large save into transactions Firestore accepts', async () => {
    const dates = Array.from(
      { length: 450 },
      (_, i) => new Date(T1.getTime() + i * 15 * 60_000),
    )

    const result = await createOpenInterviewSlots(
      reviewer,
      dates,
      LINK,
      { ...WINDOW, closes: new Date('2027-01-01T05:00:00.000Z') },
      NOW,
    )

    expect(result.created).toBe(450)
    expect(mockTransactions.count).toBe(3)
    for (const call of mockTransaction.getAll.mock.calls) {
      expect(call.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('deleteOpenInterviewSlots', () => {
  it("deletes the caller's open slots", async () => {
    docs[pathFor(T1)] = slot(T1)
    docs[pathFor(T2)] = slot(T2)

    const result = await deleteOpenInterviewSlots(reviewer, [
      interviewSlotDocId(T1.toISOString(), reviewer.uid),
      interviewSlotDocId(T2.toISOString(), reviewer.uid),
    ])

    expect(result).toEqual({ deleted: 2, skippedBooked: 0, skippedNotOwn: 0 })
    expect(docs).toEqual({})
  })

  // Un-painting must never be how somebody's interview gets cancelled.
  it('keeps booked and missed slots', async () => {
    docs[pathFor(T1)] = slot(T1, {
      intervieweeId: 'ada',
      interviewSlotStatus: 'pending',
    })
    docs[pathFor(T2)] = slot(T2, {
      intervieweeId: 'bob',
      interviewSlotStatus: 'missed',
    })

    const result = await deleteOpenInterviewSlots(reviewer, [
      interviewSlotDocId(T1.toISOString(), reviewer.uid),
      interviewSlotDocId(T2.toISOString(), reviewer.uid),
    ])

    expect(result).toEqual({ deleted: 0, skippedBooked: 2, skippedNotOwn: 0 })
    expect(Object.keys(docs)).toHaveLength(2)
  })

  it("keeps someone else's slot, even for an admin", async () => {
    docs[pathFor(T1)] = slot(T1)

    const result = await deleteOpenInterviewSlots(admin, [
      interviewSlotDocId(T1.toISOString(), reviewer.uid),
    ])

    expect(result).toEqual({ deleted: 0, skippedBooked: 0, skippedNotOwn: 1 })
    expect(docs[pathFor(T1)]).toBeDefined()
  })

  it('counts a slot already gone as neither', async () => {
    await expect(deleteOpenInterviewSlots(reviewer, ['gone'])).resolves.toEqual(
      { deleted: 0, skippedBooked: 0, skippedNotOwn: 0 },
    )
  })
})
