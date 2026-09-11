import { userService } from '$lib/services/userService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}))

describe('userService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchUserName', () => {
    it('returns the stored name when the users document exists', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ firstName: 'Demo', lastName: 'Admin' }),
      })

      await expect(userService.fetchUserName('uid-1')).resolves.toEqual({
        firstName: 'Demo',
        lastName: 'Admin',
      })
      expect(firestore.doc).toHaveBeenCalledWith(undefined, 'users', 'uid-1')
    })

    it('returns null for accounts predating the users document', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      await expect(userService.fetchUserName('uid-1')).resolves.toBeNull()
    })

    it('defaults missing name fields to empty strings', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({}),
      })

      await expect(userService.fetchUserName('uid-1')).resolves.toEqual({
        firstName: '',
        lastName: '',
      })
    })

    it('propagates read errors', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(userService.fetchUserName('uid-1')).rejects.toThrow(
        'permission-denied',
      )
    })
  })

  describe('updateUserName', () => {
    it('merges the name fields so nothing else in the document is clobbered', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await userService.updateUserName('uid-1', 'Timmy', 'Turner')

      expect(firestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        { firstName: 'Timmy', lastName: 'Turner' },
        { merge: true },
      )
    })

    it('writes unconditionally, so an older account with no document still renames', async () => {
      // setDoc+merge rather than updateDoc, and no existence precheck: admins
      // created before signup wrote a `users` document would otherwise get
      // `not-found` and be permanently unable to rename themselves.
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await userService.updateUserName('uid-1', 'Timmy', 'Turner')

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      expect(firestore.getDoc).not.toHaveBeenCalled()
    })

    it('propagates write errors', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        userService.updateUserName('uid-1', 'Timmy', 'Turner'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('checkAccountDeletionEligibility', () => {
    it('returns the eligibility the API reports', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ canDelete: false, reason: 'Reason text' }),
      })

      await expect(
        userService.checkAccountDeletionEligibility(),
      ).resolves.toEqual({ canDelete: false, reason: 'Reason text' })
      expect(global.fetch).toHaveBeenCalledWith('/api/account')
    })

    it('throws the server message on a failed request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Not signed in.' }),
      })

      await expect(
        userService.checkAccountDeletionEligibility(),
      ).rejects.toThrow('Not signed in.')
    })
  })

  describe('deleteAccountViaApi', () => {
    it('calls DELETE on the account route', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await userService.deleteAccountViaApi()

      expect(global.fetch).toHaveBeenCalledWith('/api/account', {
        method: 'DELETE',
      })
    })

    it('throws the server message when deletion is refused', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'You have a scheduled interview.' }),
      })

      await expect(userService.deleteAccountViaApi()).rejects.toThrow(
        'You have a scheduled interview.',
      )
    })
  })
})
