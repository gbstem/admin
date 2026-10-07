const mockSaveInterviewNotes = jest.fn()
const mockSaveLikelyDecision = jest.fn()
const mockDecideWithScorecard = jest.fn()
const mockDecideInBulk = jest.fn()
const mockSendDecisionEmail = jest.fn()

jest.mock('$lib/server/applicationDecisions', () => ({
  saveInterviewNotes: (...args: any[]) => mockSaveInterviewNotes(...args),
  saveLikelyDecision: (...args: any[]) => mockSaveLikelyDecision(...args),
  decideWithScorecard: (...args: any[]) => mockDecideWithScorecard(...args),
  decideInBulk: (...args: any[]) => mockDecideInBulk(...args),
}))
jest.mock('$lib/server/decisionEmails', () => ({
  sendDecisionEmail: (...args: any[]) => mockSendDecisionEmail(...args),
}))

import { currentSemester } from '$lib/data/collections'
import { POST } from '../src/routes/api/decision/+server'

const admin = {
  uid: 'admin-1',
  email: 'a@test.com',
  role: 'admin',
  emailVerified: true,
}
const reviewer = {
  uid: 'rev-1',
  email: 'r@test.com',
  role: 'reviewer',
  emailVerified: true,
}

const post = (user: unknown, body: unknown): Promise<any> =>
  (POST as any)({ request: { json: async () => body }, locals: { user } })

const scorecard = () => ({
  date: '2026-09-01T10:00',
  interviewer: 'Jane',
  notes: 'Strong',
  likelyDecision: 'likely yes',
  attendance: 'On Time',
  conversation: 4,
  conversationNotes: '',
  lastSemesterNotes: '',
  mockLessonExplanations: 3,
  mockLessonEngagement: 3,
  mockLessonPace: 3,
  mockLessonOverall: 3,
  mockLessonNotes: '',
  techNotes: '',
  teachingPreferences: '',
  availabilityNotes: '',
})

const noWrites = () => {
  for (const mock of [
    mockSaveInterviewNotes,
    mockSaveLikelyDecision,
    mockDecideWithScorecard,
    mockDecideInBulk,
    mockSendDecisionEmail,
  ]) {
    expect(mock).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDecideWithScorecard.mockResolvedValue({
    applicationId: 'a1',
    firstName: 'Ada',
  })
  mockDecideInBulk.mockImplementation(async (_semester, ids: string[]) =>
    ids.map((applicationId) => ({ applicationId, firstName: 'Ada' })),
  )
  mockSendDecisionEmail.mockResolvedValue(true)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/decision', () => {
  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])(
    'saves notes for %s, dropping any type the caller sent',
    async (_, user) => {
      await post(user, {
        action: 'saveNotes',
        semesterId: currentSemester,
        applicationId: 'a1',
        interview: { ...scorecard(), type: 'accepted' },
      })

      expect(mockSaveInterviewNotes).toHaveBeenCalledWith(
        currentSemester,
        'a1',
        scorecard(),
      )
      expect(mockSendDecisionEmail).not.toHaveBeenCalled()
    },
  )

  it('reads a cleared score as 0', async () => {
    await post(admin, {
      action: 'saveNotes',
      semesterId: currentSemester,
      applicationId: 'a1',
      interview: { ...scorecard(), conversation: null, mockLessonPace: '' },
    })

    expect(mockSaveInterviewNotes.mock.calls[0][2]).toMatchObject({
      conversation: 0,
      mockLessonPace: 0,
    })
  })

  it.each(['likely yes', null])(
    'sets the likely decision to %s',
    async (likely) => {
      await post(admin, {
        action: 'setLikelyDecision',
        semesterId: currentSemester,
        applicationId: 'a1',
        likelyDecision: likely,
      })

      expect(mockSaveLikelyDecision).toHaveBeenCalledWith(
        currentSemester,
        'a1',
        likely,
      )
    },
  )

  it('decides one applicant with their scorecard, then emails them', async () => {
    const res = await post(admin, {
      action: 'decide',
      semesterId: currentSemester,
      applicationIds: ['a1'],
      decision: 'accepted',
      interview: scorecard(),
    })

    expect(mockDecideWithScorecard).toHaveBeenCalledWith(
      currentSemester,
      'a1',
      'accepted',
      scorecard(),
    )
    expect(mockDecideInBulk).not.toHaveBeenCalled()
    expect(mockSendDecisionEmail).toHaveBeenCalledWith(
      { applicationId: 'a1', firstName: 'Ada' },
      'accepted',
    )
    expect(res.body).toEqual({ emailsFailed: 0 })
  })

  it('decides several applicants without a scorecard and counts the emails that failed', async () => {
    mockSendDecisionEmail
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const res = await post(reviewer, {
      action: 'decide',
      semesterId: currentSemester,
      applicationIds: ['a1', 'a2'],
      decision: 'interview',
    })

    expect(mockDecideInBulk).toHaveBeenCalledWith(
      currentSemester,
      ['a1', 'a2'],
      'interview',
    )
    expect(mockDecideWithScorecard).not.toHaveBeenCalled()
    expect(mockSendDecisionEmail).toHaveBeenCalledTimes(2)
    expect(res.body).toEqual({ emailsFailed: 1 })
  })

  it('emails nobody when the write is refused', async () => {
    mockDecideInBulk.mockRejectedValue(
      Object.assign(new Error('nope'), { status: 404, body: { message: 'x' } }),
    )

    await expect(
      post(admin, {
        action: 'decide',
        semesterId: currentSemester,
        applicationIds: ['a1'],
        decision: 'rejected',
      }),
    ).rejects.toBeDefined()
    expect(mockSendDecisionEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['a signed-out caller', null, 401],
    [
      'an instructor',
      { uid: 'i', role: 'instructor', emailVerified: true },
      403,
    ],
  ])('refuses %s', async (_, user, status) => {
    await expect(
      post(user, {
        action: 'setLikelyDecision',
        semesterId: currentSemester,
        applicationId: 'a1',
        likelyDecision: null,
      }),
    ).rejects.toMatchObject({ status })
    noWrites()
  })

  it.each([
    [
      'an unknown semester',
      {
        action: 'setLikelyDecision',
        semesterId: 'Nope99',
        applicationId: 'a1',
        likelyDecision: null,
      },
    ],
    [
      'a path-like application id',
      {
        action: 'setLikelyDecision',
        semesterId: currentSemester,
        applicationId: 'a/b',
        likelyDecision: null,
      },
    ],
    [
      'a scorecard with several applications',
      {
        action: 'decide',
        semesterId: currentSemester,
        applicationIds: ['a1', 'a2'],
        decision: 'accepted',
        interview: scorecard(),
      },
    ],
    [
      'an unknown decision',
      {
        action: 'decide',
        semesterId: currentSemester,
        applicationIds: ['a1'],
        decision: 'hired',
      },
    ],
    [
      'no applications',
      {
        action: 'decide',
        semesterId: currentSemester,
        applicationIds: [],
        decision: 'accepted',
      },
    ],
    [
      'a score out of range',
      {
        action: 'saveNotes',
        semesterId: currentSemester,
        applicationId: 'a1',
        interview: { ...scorecard(), conversation: 9 },
      },
    ],
    // The old email-only payload.
    [
      'the old payload',
      { applicantUid: 'a1', decision: 'accepted', name: 'A' },
    ],
  ])('refuses %s with a 400, writing nothing', async (_, body) => {
    await expect(post(admin, body)).rejects.toMatchObject({ status: 400 })
    noWrites()
  })
})
