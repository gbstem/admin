import { registrationService } from '#lib/services/registrationService.js'
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

  describe('setBypassAgeLimits', () => {
    const actionResponse = (body: unknown, status = 200) =>
      ({ status, text: async () => JSON.stringify(body) }) as Response

    beforeEach(() => {
      global.fetch = jest.fn()
    })

    it("posts the value to the action, in the collection's semester", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        actionResponse({ type: 'success', status: 200, data: '[{}]' }),
      )

      await registrationService.setBypassAgeLimits(
        'semesters/Spring26/registrations',
        'reg-1',
        true,
      )

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe(
        '/registrations?/setBypassAgeLimits&id=reg-1&semester=Spring26',
      )
      expect(init.method).toBe('POST')
      expect(init.body.get('bypassAgeLimits')).toBe('true')
    })

    it("throws the action's refusal with its status", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        actionResponse(
          {
            type: 'error',
            status: 403,
            error: { message: 'Unauthorized: Admin role required.' },
          },
          403,
        ),
      )

      await expect(
        registrationService.setBypassAgeLimits(
          'semesters/Spring26/registrations',
          'reg-1',
          false,
        ),
      ).rejects.toEqual({
        status: 403,
        message: 'Unauthorized: Admin role required.',
      })
    })
  })
})
