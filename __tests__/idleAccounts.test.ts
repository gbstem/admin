const mockListUsers = jest.fn()
const mockUpdateUser = jest.fn()
const mockRevokeRefreshTokens = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    listUsers: (...args: any[]) => mockListUsers(...args),
    updateUser: (...args: any[]) => mockUpdateUser(...args),
    revokeRefreshTokens: (...args: any[]) => mockRevokeRefreshTokens(...args),
  },
}))

import {
  IDLE_LIMIT_DAYS,
  isIdle,
  lastActiveMs,
  resetIdleVerification,
} from '$lib/server/idleAccounts'

const NOW = new Date('2026-10-07T12:00:00Z')
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toUTCString()

/** The slice of an Auth UserRecord the module reads. */
function account(
  uid: string,
  {
    role = 'admin' as string | null,
    emailVerified = true,
    refreshed = undefined as number | undefined,
    signedIn = 2000,
    created = 3000,
  } = {},
) {
  return {
    uid,
    emailVerified,
    customClaims: role ? { role } : undefined,
    metadata: {
      creationTime: daysAgo(created),
      lastSignInTime: daysAgo(signedIn),
      lastRefreshTime: refreshed === undefined ? undefined : daysAgo(refreshed),
    },
  } as any
}

describe('lastActiveMs', () => {
  test('takes the latest of refresh, sign-in and creation', () => {
    const user = account('a', { refreshed: 10, signedIn: 300, created: 900 })
    expect(lastActiveMs(user)).toBe(Date.parse(daysAgo(10)))
  })

  test('falls back to sign-in, then creation, when there is no refresh', () => {
    expect(lastActiveMs(account('a', { signedIn: 30 }))).toBe(
      Date.parse(daysAgo(30)),
    )
    const noSignIn = account('a', { created: 50 })
    noSignIn.metadata.lastSignInTime = undefined
    expect(lastActiveMs(noSignIn)).toBe(Date.parse(daysAgo(50)))
  })
})

describe('isIdle', () => {
  test.each(['admin', 'reviewer', 'instructor'])(
    'resets a %s after 180 days but not before',
    (role) => {
      expect(isIdle(account('a', { role, refreshed: 181 }), NOW)).toBe(true)
      expect(isIdle(account('a', { role, refreshed: 179 }), NOW)).toBe(false)
    },
  )

  test('gives a parent two years', () => {
    expect(IDLE_LIMIT_DAYS.student).toBe(730)
    expect(isIdle(account('a', { role: 'student', refreshed: 400 }), NOW)).toBe(
      false,
    )
    expect(isIdle(account('a', { role: 'student', refreshed: 731 }), NOW)).toBe(
      true,
    )
  })

  test('counts a recent refresh as activity even with an old sign-in', () => {
    expect(isIdle(account('a', { refreshed: 2, signedIn: 700 }), NOW)).toBe(
      false,
    )
  })

  test('leaves alone an unverified account, a missing role and an unknown role', () => {
    expect(isIdle(account('a', { emailVerified: false }), NOW)).toBe(false)
    expect(isIdle(account('a', { role: null }), NOW)).toBe(false)
    expect(isIdle(account('a', { role: 'superuser' }), NOW)).toBe(false)
  })
})

describe('resetIdleVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateUser.mockResolvedValue({})
    mockRevokeRefreshTokens.mockResolvedValue(undefined)
  })

  test('resets only the idle accounts, across pages, and revokes their tokens', async () => {
    mockListUsers
      .mockResolvedValueOnce({
        users: [
          account('idle-1', { refreshed: 300 }),
          account('active', { refreshed: 5 }),
        ],
        pageToken: 'next',
      })
      .mockResolvedValueOnce({
        users: [account('idle-2', { role: 'student', refreshed: 800 })],
      })
    const summary = await resetIdleVerification({ now: NOW })

    expect(mockListUsers).toHaveBeenNthCalledWith(1, 1000, undefined)
    expect(mockListUsers).toHaveBeenNthCalledWith(2, 1000, 'next')
    expect(summary).toEqual({
      scanned: 3,
      idle: 2,
      reset: 2,
      failed: 0,
      dryRun: false,
    })
    expect(mockUpdateUser).toHaveBeenCalledWith('idle-1', {
      emailVerified: false,
    })
    expect(mockUpdateUser).toHaveBeenCalledWith('idle-2', {
      emailVerified: false,
    })
    expect(mockUpdateUser).not.toHaveBeenCalledWith('active', expect.anything())
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('idle-1')
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('idle-2')
  })

  test('changes nobody on a dry run', async () => {
    mockListUsers.mockResolvedValue({
      users: [account('idle', { refreshed: 300 })],
    })

    const summary = await resetIdleVerification({ now: NOW, dryRun: true })

    expect(summary).toEqual({
      scanned: 1,
      idle: 1,
      reset: 0,
      failed: 0,
      dryRun: true,
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled()
  })

  test('counts an account that fails and carries on with the rest, logging its uid but not anything else', async () => {
    mockListUsers.mockResolvedValue({
      users: [
        account('broken', { refreshed: 300 }),
        account('fine', { refreshed: 300 }),
      ],
    })
    mockUpdateUser.mockImplementation(async (uid: string) => {
      if (uid === 'broken') throw new Error('auth/internal-error')
    })

    const summary = await resetIdleVerification({ now: NOW })

    expect(summary).toMatchObject({ idle: 2, reset: 1, failed: 1 })
    expect(mockRevokeRefreshTokens).toHaveBeenCalledTimes(1)
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('fine')
    expect((console.error as jest.Mock).mock.calls[0][0]).toContain('broken')
  })
})
