const docs: Record<string, any> = {}
const writes: { op: string; path: string; data: any; options?: any }[] = []
const mockTransaction = {
  get: jest.fn(async (ref: { path: string }) => ({
    exists: ref.path in docs,
    data: () => docs[ref.path],
  })),
  set: jest.fn((ref: { path: string }, data: any, options?: any) => {
    writes.push({ op: 'set', path: ref.path, data, options })
  }),
  update: jest.fn((ref: { path: string }, data: any) => {
    writes.push({ op: 'update', path: ref.path, data })
  }),
}
const mockRunTransaction = jest.fn(
  (fn: (t: typeof mockTransaction) => unknown) => fn(mockTransaction),
)

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (path: string) => ({ path }),
    runTransaction: (fn: any) => mockRunTransaction(fn),
  },
}))

import {
  decideInBulk,
  decideWithScorecard,
  saveInterviewNotes,
  saveLikelyDecision,
} from '#lib/server/applicationDecisions.js'

const APP = (id: string) => `semesters/Spring26/applications/${id}`
const DECISION = (id: string) => `semesters/Spring26/decisions/${id}`

const scorecard = {
  date: '2026-09-01T10:00',
  interviewer: 'Jane',
  notes: 'Strong',
  type: 'interview',
  likelyDecision: 'likely yes',
  attendance: 'On Time',
  conversation: 4,
  conversationNotes: 'c',
  lastSemesterNotes: 'l',
  mockLessonExplanations: 3,
  mockLessonEngagement: 3,
  mockLessonPace: 3,
  mockLessonOverall: 3,
  mockLessonNotes: 'm',
  techNotes: 't',
  teachingPreferences: 'p',
  availabilityNotes: 'a',
} as Data.Interview

const application = (firstName = 'Ada') => ({
  personal: { firstName },
  meta: { uid: 'ignored', decided: false },
})

const flagged = (id: string) => ({
  op: 'update',
  path: APP(id),
  data: { 'meta.decided': true },
})

// An official decision also copies its type onto the application.
const decidedAs = (id: string, decision: Data.Decision) => ({
  op: 'update',
  path: APP(id),
  data: { 'meta.decided': true, 'meta.decisionType': decision },
})

beforeEach(() => {
  jest.clearAllMocks()
  writes.length = 0
  for (const key of Object.keys(docs)) delete docs[key]
})

describe('saveInterviewNotes', () => {
  it('merges the notes, without a type or likely decision, and flags the application', async () => {
    docs[APP('a1')] = application()

    await saveInterviewNotes('Spring26', 'a1', scorecard)

    const { type: _type, likelyDecision: _likely, ...notes } = scorecard
    expect(writes).toEqual([
      {
        op: 'set',
        path: DECISION('a1'),
        data: { ...notes, semester: 'Spring26' },
        options: { merge: true },
      },
      flagged('a1'),
    ])
  })

  it('refuses (404) a missing application, writing nothing', async () => {
    await expect(
      saveInterviewNotes('Spring26', 'nope', scorecard),
    ).rejects.toMatchObject({ status: 404 })
    expect(writes).toEqual([])
  })
})

describe('saveLikelyDecision', () => {
  it("keeps the official decision that is stored, not the caller's idea of it", async () => {
    docs[APP('a1')] = application()
    docs[DECISION('a1')] = { type: 'accepted', notes: 'kept by the merge' }

    await saveLikelyDecision('Spring26', 'a1', 'likely no')

    expect(writes[0]).toEqual({
      op: 'set',
      path: DECISION('a1'),
      data: {
        likelyDecision: 'likely no',
        type: 'accepted',
        semester: 'Spring26',
      },
      options: { merge: true },
    })
    expect(writes[1]).toEqual(flagged('a1'))
  })

  it('writes a null type when no decision exists yet, and can clear the likely decision', async () => {
    docs[APP('a1')] = application()

    await saveLikelyDecision('Spring26', 'a1', null)

    expect(writes[0].data).toEqual({
      likelyDecision: null,
      type: null,
      semester: 'Spring26',
    })
  })
})

describe('decideWithScorecard', () => {
  it('replaces the decision with the whole scorecard under the new type', async () => {
    docs[APP('a1')] = application('Grace')

    const decided = await decideWithScorecard(
      'Spring26',
      'a1',
      'accepted',
      scorecard,
    )

    expect(decided).toEqual({ applicationId: 'a1', firstName: 'Grace' })
    expect(writes).toEqual([
      {
        op: 'set',
        path: DECISION('a1'),
        data: { ...scorecard, type: 'accepted', semester: 'Spring26' },
        // No merge: the scorecard is the whole document.
        options: undefined,
      },
      decidedAs('a1', 'accepted'),
    ])
  })
})

describe('decideInBulk', () => {
  it('merges the type alone into each decision, leaving scorecards, and copies it to each application', async () => {
    docs[APP('a1')] = application('Ada')
    docs[APP('a2')] = application('Grace')

    const decided = await decideInBulk('Spring26', ['a1', 'a2'], 'rejected')

    expect(decided).toEqual([
      { applicationId: 'a1', firstName: 'Ada' },
      { applicationId: 'a2', firstName: 'Grace' },
    ])
    expect(writes.filter((w) => w.op === 'set')).toEqual(
      ['a1', 'a2'].map((id) => ({
        op: 'set',
        path: DECISION(id),
        data: { type: 'rejected', semester: 'Spring26' },
        options: { merge: true },
      })),
    )
    expect(writes.filter((w) => w.op === 'update')).toEqual([
      decidedAs('a1', 'rejected'),
      decidedAs('a2', 'rejected'),
    ])
    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
  })

  it('refuses the whole selection when one application is missing', async () => {
    docs[APP('a1')] = application()

    await expect(
      decideInBulk('Spring26', ['a1', 'gone'], 'rejected'),
    ).rejects.toMatchObject({ status: 404 })
    expect(writes).toEqual([])
  })

  it("splits a selection past Firestore's 500-write limit into transactions of 250", async () => {
    const ids = Array.from({ length: 251 }, (_, i) => `a${i}`)
    for (const id of ids) docs[APP(id)] = application()

    const decided = await decideInBulk('Spring26', ids, 'waitlisted')

    expect(decided).toHaveLength(251)
    expect(mockRunTransaction).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(502)
  })
})
