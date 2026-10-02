import { handle, handleError } from '../src/hooks.server'
import { adminAuth } from '$lib/server/firebase'

function createEvent(sessionCookie?: string) {
  return {
    cookies: {
      get: jest.fn((name: string) =>
        name === '__session' ? sessionCookie : undefined,
      ),
    },
    locals: {} as App.Locals,
  } as any
}

describe('hooks.server handle', () => {
  const resolve = jest.fn().mockResolvedValue('resolved-response')

  beforeEach(() => {
    resolve.mockClear()
    ;(adminAuth.verifySessionCookie as jest.Mock).mockReset()
    ;(adminAuth.getUser as jest.Mock).mockReset()
  })

  it('sets locals.user and resolves the request for an admin session', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-1',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-1',
      email: 'admin@example.com',
      emailVerified: true,
      customClaims: { role: 'admin' },
    })
    const event = createEvent('cookie-value')

    const result = await handle({ event, resolve } as any)

    expect(event.locals.user).toEqual({
      uid: 'uid-1',
      email: 'admin@example.com',
      emailVerified: true,
      role: 'admin',
    })
    expect(resolve).toHaveBeenCalledWith(event)
    expect(result).toBe('resolved-response')
  })

  it('sets locals.user and resolves the request for a reviewer session', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-2',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-2',
      email: 'reviewer@example.com',
      emailVerified: true,
      customClaims: { role: 'reviewer' },
    })
    const event = createEvent('cookie-value')

    await handle({ event, resolve } as any)

    expect(event.locals.user?.role).toBe('reviewer')
    expect(resolve).toHaveBeenCalledWith(event)
  })

  // Regression test: redirect() throws immediately (matching real
  // @sveltejs/kit), and was previously called inside the try block, so its
  // throw was silently swallowed by the surrounding catch and the redirect
  // never happened. It must now propagate out of handle().
  it('redirects non-admin/reviewer roles to the portal instead of silently continuing', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-3',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-3',
      email: 'student@example.com',
      emailVerified: true,
      customClaims: { role: 'student' },
    })
    const event = createEvent('cookie-value')

    let thrown: any
    try {
      await handle({ event, resolve } as any)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeDefined()
    expect(thrown.status).toBe(301)
    expect(thrown.location).toBe('https://portal.gbstem.org')
    expect(event.locals.user).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('sets locals.user to null and resolves without redirecting when the session cookie is invalid', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockRejectedValue(
      new Error('invalid cookie'),
    )
    const event = createEvent('bad-cookie')

    const result = await handle({ event, resolve } as any)

    expect(event.locals.user).toBeNull()
    expect(resolve).toHaveBeenCalledWith(event)
    expect(result).toBe('resolved-response')
  })
})

describe('hooks.server handleError', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  const admin = { uid: 'uid-1', email: 'admin@example.com', role: 'admin' }

  const shape = (
    error: unknown,
    {
      user = null,
      status = 500,
      message = 'Internal Error',
    }: { user?: unknown; status?: number; message?: string } = {},
  ) =>
    handleError({
      error,
      event: { locals: { user } },
      status,
      message,
    } as any) as App.Error

  // Unauthenticated callers reach this (a malformed POST to /api/auth is
  // enough), so nothing about the server may leave in the response.
  it('gives a signed-out caller only the generic message and an id, never the stack or raw message', () => {
    const err = new Error(
      'ENOENT: /var/task/.svelte-kit/output/server/secret.js',
    )

    const result = shape(err)

    expect(result).toEqual({
      message: 'Internal Error',
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(JSON.stringify(result)).not.toContain('ENOENT')
    expect(JSON.stringify(result)).not.toContain(err.stack!.split('\n')[1])
  })

  it('treats a request with no locals at all as signed out', () => {
    const result = handleError({
      error: new Error('boom'),
      event: {},
      status: 500,
      message: 'Internal Error',
    } as any) as App.Error

    expect(result).toEqual({
      message: 'Internal Error',
      errorId: expect.any(String),
    })
  })

  // Admins and reviewers are trusted, and often this site's developers.
  it('gives a signed-in user the raw message, code and stack', () => {
    const err: any = new Error('Firestore index missing')
    err.code = 'failed-precondition'

    const result = shape(err, { user: admin })

    expect(result).toEqual({
      message: 'Firestore index missing',
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      code: 'failed-precondition',
      details: err.stack,
    })
  })

  it('falls back to the generic message and code for a signed-in user when the error has none', () => {
    const result = shape('a thrown string', { user: admin })

    expect(result).toMatchObject({
      message: 'Internal Error',
      code: 'INTERNAL_ERROR',
      details: 'a thrown string',
    })
  })

  it('logs the full error under the id it returns', () => {
    const err = new Error('boom')

    const { errorId } = shape(err)

    expect(errorSpy).toHaveBeenCalledWith(
      `[SvelteKit Server Error ${errorId}]:`,
      err,
    )
  })

  it('gives each error its own id', () => {
    expect(shape(new Error('a')).errorId).not.toBe(
      shape(new Error('b')).errorId,
    )
  })

  it("passes a 404's message through without logging it", () => {
    const result = shape(new Error('Not found: /nope'), {
      status: 404,
      message: 'Not Found',
    })

    expect(result.message).toBe('Not Found')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
