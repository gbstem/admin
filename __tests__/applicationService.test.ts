import { applicationService } from '$lib/services/applicationService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

const mockBatch = { set: jest.fn(), update: jest.fn(), commit: jest.fn() }

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  writeBatch: jest.fn(() => mockBatch),
}))

/** Asserts one batch wrote a decision document and its `meta.decided` flag. */
function expectDecisionBatch({ merge }: { merge: boolean }) {
  expect(firestore.writeBatch).toHaveBeenCalledTimes(1)
  expect(mockBatch.set).toHaveBeenCalledTimes(1)
  const setCall = mockBatch.set.mock.calls[0]
  if (merge) {
    expect(setCall[2]).toEqual({ merge: true })
  } else {
    // A full decision replaces the document, so it is written without merge.
    expect(setCall).toHaveLength(2)
  }
  expect(mockBatch.update).toHaveBeenCalledWith(expect.anything(), {
    'meta.decided': true,
  })
  expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  expect(firestore.setDoc).not.toHaveBeenCalled()
}

describe('admin applicationService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBatch.commit.mockReset().mockResolvedValue(undefined)
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

  describe('saveNotes', () => {
    it('merges the notes into the decision doc and flags the application, in one batch', async () => {
      await applicationService.saveNotes('applications', 'app-1', {} as any)

      expectDecisionBatch({ merge: true })
    })

    it('flags nothing when the batch is refused', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'))

      await expect(
        applicationService.saveNotes('applications', 'app-1', {} as any),
      ).rejects.toThrow('permission-denied')
    })

    it('writes to the viewed semester decisions collection when provided', async () => {
      ;(firestore.doc as jest.Mock).mockClear()
      await applicationService.saveNotes(
        'semesters/Fall25/applications',
        'app-1',
        {} as any,
        'Fall25',
      )

      expect(firestore.doc).toHaveBeenCalledWith(
        undefined,
        'semesters/Fall25/decisions',
        'app-1',
      )
    })
  })

  describe('saveLikelyDecision', () => {
    it('merges the likely decision into the decision doc and flags the application, in one batch', async () => {
      await applicationService.saveLikelyDecision(
        'applications',
        'app-1',
        'likely yes',
        null,
      )

      expectDecisionBatch({ merge: true })
    })
  })

  describe('submitOfficialDecision', () => {
    it('submits interview decision and calls scheduleInterview API', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await applicationService.submitOfficialDecision(
        'applications',
        'app-1',
        'interview',
        {} as any,
        'alice@example.com',
        'Alice',
        '2026-09-01',
      )

      expectDecisionBatch({ merge: false })
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/scheduleInterview',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sends no email when the decision batch is refused', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'))

      await expect(
        applicationService.submitOfficialDecision(
          'applications',
          'app-1',
          'accepted',
          {} as any,
          'alice@example.com',
          'Alice',
          '2026-09-01',
        ),
      ).rejects.toThrow('permission-denied')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('submits accepted decision and calls decision API', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await applicationService.submitOfficialDecision(
        'applications',
        'app-1',
        'accepted',
        {} as any,
        'alice@example.com',
        'Alice',
        '2026-09-01',
      )

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/decision',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('fetches application document to use true applicant email and name if available', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          personal: { email: 'david-h@example.com', firstName: 'David' },
        }),
      })
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await applicationService.submitOfficialDecision(
        'applications',
        'app-10',
        'interview',
        {} as any,
        'stale@example.com',
        'Stale',
        '2026-09-01',
      )

      // The re-fetched address is still what the server falls back to, so the
      // stale one passed by the caller must not win. The uid the server
      // prefers is the application id.
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/scheduleInterview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            applicantUid: 'app-10',
            email: 'david-h@example.com',
            name: 'David',
            deadline: 'Mon, Aug 31',
          }),
        }),
      )
    })

    it('warns but does not throw if the interview scheduling email API responds not-ok', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(
        applicationService.submitOfficialDecision(
          'applications',
          'app-1',
          'interview',
          {} as any,
          'alice@example.com',
          'Alice',
          '2026-09-01',
        ),
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to send interview scheduling email:',
        'Bad Request',
      )
      warnSpy.mockRestore()
    })

    it('warns but does not throw if the decision notification email API responds not-ok', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await applicationService.submitOfficialDecision(
        'applications',
        'app-1',
        'rejected',
        {} as any,
        'alice@example.com',
        'Alice',
        '2026-09-01',
      )

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to send decision notification email:',
        'Bad Request',
      )
      warnSpy.mockRestore()
    })

    it('warns but does not throw if the email fetch call itself rejects', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('network down'),
      )
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(
        applicationService.submitOfficialDecision(
          'applications',
          'app-1',
          'accepted',
          {} as any,
          'alice@example.com',
          'Alice',
          '2026-09-01',
        ),
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledWith(
        'Email notification request failed:',
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })
  })

  describe('saveApplicationDetails', () => {
    it('saves the updated values with semester stamping', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await applicationService.saveApplicationDetails(
        'applications',
        'app-1',
        { personal: { firstName: 'Alice' } } as any,
        'Spring26',
      )

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload, options] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual(
        expect.objectContaining({
          personal: { firstName: 'Alice' },
          semester: 'Spring26',
        }),
      )
      // Merge-only write so fields the edit form doesn't own (timestamps, meta, ...)
      // can't be clobbered by a stale in-memory snapshot - see saveApplicationDetails's docstring.
      expect(options).toEqual({ merge: true })
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        applicationService.saveApplicationDetails(
          'applications',
          'app-1',
          {} as any,
        ),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('bulkSetDecision', () => {
    it('writes every decision and flag in one batch, then emails every applicant', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({
          personal: { email: 'alice@example.com', firstName: 'Alice' },
        }),
      })
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      await applicationService.bulkSetDecision(
        ['app-1', 'app-2'],
        'applications',
        'decisions',
        'accepted',
        'Spring26',
      )

      expect(firestore.writeBatch).toHaveBeenCalledTimes(1)
      expect(mockBatch.set).toHaveBeenCalledTimes(2)
      expect(mockBatch.update).toHaveBeenCalledTimes(2)
      expect(mockBatch.commit).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/decision',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'accepted',
            applicantUid: 'app-1',
            email: 'alice@example.com',
            name: 'Alice',
          }),
        }),
      )
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload).toEqual(
        expect.objectContaining({ type: 'accepted', semester: 'Spring26' }),
      )
    })

    it('rejects and emails nobody if the batch is refused', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'))

      await expect(
        applicationService.bulkSetDecision(
          ['app-1', 'app-2'],
          'applications',
          'decisions',
          'rejected',
        ),
      ).rejects.toThrow('permission-denied')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("splits a selection past Firestore's 500-write batch limit", async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      })
      const ids = Array.from({ length: 251 }, (_, i) => `app-${i}`)

      await applicationService.bulkSetDecision(
        ids,
        'applications',
        'decisions',
        'waitlisted',
      )

      // Two writes per application, so 250 fill the first batch.
      expect(firestore.writeBatch).toHaveBeenCalledTimes(2)
      expect(mockBatch.commit).toHaveBeenCalledTimes(2)
      expect(mockBatch.set).toHaveBeenCalledTimes(251)
      expect(mockBatch.update).toHaveBeenCalledTimes(251)
    })
  })
})
