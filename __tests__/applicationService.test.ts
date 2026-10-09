import { applicationService } from '#lib/services/applicationService.js'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
}))

describe('admin applicationService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('loadApplicationDetails', () => {
    it('loads application and associated decision data', async () => {
      const mockApp = {
        personal: { email: 'test@example.com', firstName: 'Alice' },
        meta: { decided: true },
      }
      const mockDecision = { type: 'interview', decision: 'interview' }

      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => mockApp,
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => mockDecision,
        })

      const res = await applicationService.loadApplicationDetails(
        'applications',
        'app-1',
      )

      expect(res.values.personal.email).toBe('test@example.com')
      expect(res.decision).toBe('interview')
    })

    it('throws error if application document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      await expect(
        applicationService.loadApplicationDetails('applications', 'app-1'),
      ).rejects.toThrow('Application not found.')
    })

    it('skips fetching a decision doc when meta.decided is false', async () => {
      const mockApp = {
        personal: { email: 'test@example.com', firstName: 'Alice' },
        meta: { decided: false },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockApp,
      })

      const res = await applicationService.loadApplicationDetails(
        'applications',
        'app-1',
      )

      expect(firestore.getDoc).toHaveBeenCalledTimes(1)
      expect(res.decision).toBeNull()
    })
  })
})

describe('applicationService decision writes', () => {
  const interview = {
    date: '2026-09-01T10:00',
    interviewer: 'Jane',
    notes: 'Good',
    type: 'interview',
    likelyDecision: 'likely yes',
    attendance: 'On Time',
    conversation: 4,
  } as Data.Interview

  const respond = (body: unknown, ok = true) =>
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok,
      statusText: 'Bad Request',
      json: async () => body,
    })
  const posted = () => {
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/decision')
    expect(init.method).toBe('POST')
    return JSON.parse(init.body)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  it('saveNotes posts the scorecard for the viewed semester', async () => {
    respond({ emailsFailed: 0 })

    await applicationService.saveNotes('app-1', interview, 'Spring26')

    expect(posted()).toEqual({
      action: 'saveNotes',
      semesterId: 'Spring26',
      applicationId: 'app-1',
      interview,
    })
  })

  it('saveLikelyDecision posts the likely decision, null included', async () => {
    respond({ emailsFailed: 0 })

    await applicationService.saveLikelyDecision('app-1', null, 'Spring26')

    expect(posted()).toEqual({
      action: 'setLikelyDecision',
      semesterId: 'Spring26',
      applicationId: 'app-1',
      likelyDecision: null,
    })
  })

  it('submitOfficialDecision posts one application with its scorecard and reports the email', async () => {
    respond({ emailsFailed: 1 })

    await expect(
      applicationService.submitOfficialDecision(
        'app-1',
        'accepted',
        interview,
        'Spring26',
      ),
    ).resolves.toEqual({ emailSent: false })

    expect(posted()).toEqual({
      action: 'decide',
      semesterId: 'Spring26',
      applicationIds: ['app-1'],
      decision: 'accepted',
      interview,
    })
  })

  it('bulkSetDecision posts every id with the decision alone', async () => {
    respond({ emailsFailed: 0 })

    await expect(
      applicationService.bulkSetDecision(['a', 'b'], 'rejected', 'Spring26'),
    ).resolves.toEqual({ emailsFailed: 0 })

    expect(posted()).toEqual({
      action: 'decide',
      semesterId: 'Spring26',
      applicationIds: ['a', 'b'],
      decision: 'rejected',
    })
  })

  it("throws the route's refusal", async () => {
    respond({ message: 'Application app-1 not found.' }, false)

    await expect(
      applicationService.saveNotes('app-1', interview, 'Spring26'),
    ).rejects.toThrow('Application app-1 not found.')
  })
})

describe('applicationService.fetchApplicantEmails', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock
  })

  // An application's id is its applicant's uid.
  it('asks for the applicant account behind each application', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ emails: { 'app-uid': 'applicant@example.com' } }),
    })

    await expect(
      applicationService.fetchApplicantEmails(['app-uid']),
    ).resolves.toEqual({ 'app-uid': 'applicant@example.com' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      intent: 'applicants',
      uids: ['app-uid'],
      context: { applicationIds: ['app-uid'] },
    })
  })
})
