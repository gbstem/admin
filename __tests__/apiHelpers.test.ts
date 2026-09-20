import {
  verifyAdmin,
  verifyAuthenticated,
  handleApiError,
} from '../src/lib/server/apiHelpers'
import { error as createError } from '@sveltejs/kit'
import { z } from 'zod'

/**
 * Calls `fn` and returns whatever it throws, or `undefined` if it doesn't -
 * so the assertions below run unconditionally instead of inside a
 * try/catch, where a function that stops throwing would silently skip them.
 */
function captureThrown(fn: () => unknown): any {
  try {
    fn()
  } catch (err) {
    return err
  }
  return undefined
}

describe('apiHelpers', () => {
  describe('verifyAdmin', () => {
    it('throws 401 if user is not signed in', () => {
      const locals = {} as App.Locals
      const err = captureThrown(() => verifyAdmin(locals))
      expect(err.status).toBe(401)
      expect(err.body.message).toBe('User not signed in.')
    })

    it('throws 403 if user is not an admin', () => {
      const locals = {
        user: { uid: '123', role: 'student' },
      } as any as App.Locals
      const err = captureThrown(() => verifyAdmin(locals))
      expect(err.status).toBe(403)
      expect(err.body.message).toBe('Unauthorized: Admin role required.')
    })

    it('returns the user if role is admin', () => {
      const user = { uid: '123', role: 'admin' }
      const locals = { user } as any as App.Locals
      const result = verifyAdmin(locals)
      expect(result).toBe(user)
    })
  })

  describe('verifyAuthenticated', () => {
    it('throws 401 if user is not signed in', () => {
      const locals = {} as App.Locals
      const err = captureThrown(() => verifyAuthenticated(locals))
      expect(err.status).toBe(401)
      expect(err.body.message).toBe('User not signed in.')
    })

    it('returns the user if signed in', () => {
      const user = { uid: '456', role: 'instructor' }
      const locals = { user } as any as App.Locals
      const result = verifyAuthenticated(locals)
      expect(result).toBe(user)
    })
  })

  describe('handleApiError', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('re-throws HttpError as-is', () => {
      const httpErr = captureThrown(() => createError(404, 'Not found'))
      const err = captureThrown(() => handleApiError('test/route', httpErr))
      expect(err).toBe(httpErr)
    })

    it('handles ZodError with formatted path and message', () => {
      const schema = z.object({ name: z.string().min(3) })
      const result = schema.safeParse({ name: 'a' })
      expect(result.success).toBe(false)
      const zodError = (result as z.SafeParseError<{ name: string }>).error
      const err = captureThrown(() => handleApiError('test/route', zodError))
      expect(err.status).toBe(400)
      expect(err.body.message).toContain('Validation failed: name:')
    })

    it('handles string errors', () => {
      const err = captureThrown(() =>
        handleApiError('test/route', 'Direct string error'),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Direct string error')
    })

    it('handles Error instances', () => {
      const err = captureThrown(() =>
        handleApiError('test/route', new Error('Something broke')),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Something broke')
    })

    it('handles object with errorInfo.message', () => {
      const errWithInfo = { errorInfo: { message: 'Firebase auth error' } }
      const err = captureThrown(() => handleApiError('test/route', errWithInfo))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Firebase auth error')
    })

    it('handles object with errorInfo and empty message', () => {
      const errWithEmptyInfo = { errorInfo: { message: '' } }
      const err = captureThrown(() =>
        handleApiError('test/route', errWithEmptyInfo),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe(
        'Please wait a few minutes before trying again.',
      )
    })

    it('handles object with message string property', () => {
      const errWithMsg = { message: 'Object error message' }
      const err = captureThrown(() => handleApiError('test/route', errWithMsg))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Object error message')
    })

    it('handles unknown error types with fallback message', () => {
      const err = captureThrown(() => handleApiError('test/route', 12345))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Something went wrong. Please try again.')
    })
  })
})
