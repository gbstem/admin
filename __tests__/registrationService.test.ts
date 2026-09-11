import { registrationService } from '$lib/services/registrationService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  runTransaction: jest.fn(),
}))

describe('admin registrationService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchRegistration', () => {
    it('returns registration data when the document exists', async () => {
      const mockData = {
        personal: { studentFirstName: 'Alice' },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await registrationService.fetchRegistration(
        'registrations',
        'reg-1',
      )
      expect(res).toEqual(mockData)
    })

    it('returns null if the registration document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await registrationService.fetchRegistration(
        'registrations',
        'reg-1',
      )
      expect(res).toBeNull()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('network error'),
      )

      await expect(
        registrationService.fetchRegistration('registrations', 'reg-1'),
      ).rejects.toThrow('network error')
    })
  })

  describe('saveRegistration', () => {
    it('saves updated values stamped with the semester derived from the collection path', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await registrationService.saveRegistration(
        'semesters/Fall25/registrations',
        'reg-1',
        { personal: { studentFirstName: 'Alice' } } as any,
      )

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload, options] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual(
        expect.objectContaining({
          personal: { studentFirstName: 'Alice' },
          semester: 'Fall25',
        }),
      )
      // Merge-only write so fields the edit form doesn't own (timestamps, meta, ...)
      // can't be clobbered by a stale in-memory snapshot - see saveRegistration's docstring.
      expect(options).toEqual({ merge: true })
    })

    it('falls back to the current semester when the collection path is not semester-scoped', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await registrationService.saveRegistration(
        'registrations',
        'reg-1',
        {} as any,
      )

      const [, payload] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload.semester).toEqual(expect.any(String))
      expect(payload.semester.length).toBeGreaterThan(0)
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        registrationService.saveRegistration(
          'registrations',
          'reg-1',
          {} as any,
        ),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('toggleBypassAgeLimits', () => {
    let transaction: { get: jest.Mock; update: jest.Mock }

    function withRegistration(snapshot: Record<string, unknown>) {
      transaction = {
        get: jest.fn().mockResolvedValue(snapshot),
        update: jest.fn(),
      }
      ;(firestore.runTransaction as jest.Mock).mockImplementation(
        async (_db: unknown, fn: any) => fn(transaction),
      )
    }

    it('flips the flag it read, inside one transaction', async () => {
      withRegistration({
        exists: () => true,
        data: () => ({ agreements: { bypassAgeLimits: false } }),
      })

      await registrationService.toggleBypassAgeLimits('reg-1')

      expect(firestore.runTransaction).toHaveBeenCalledTimes(1)
      expect(transaction.update).toHaveBeenCalledWith(expect.anything(), {
        'agreements.bypassAgeLimits': true,
      })
    })

    it('does nothing if the registration document does not exist', async () => {
      withRegistration({ exists: () => false })

      await registrationService.toggleBypassAgeLimits('reg-1')

      expect(transaction.update).not.toHaveBeenCalled()
    })

    it('propagates a failed transaction', async () => {
      ;(firestore.runTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        registrationService.toggleBypassAgeLimits('reg-1'),
      ).rejects.toThrow('permission-denied')
    })
  })
})
