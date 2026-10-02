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
