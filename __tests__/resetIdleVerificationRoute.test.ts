/**
 * @jest-environment node
 */
// The routes answer with Fetch API `Response`s, which jsdom does not provide.
const mockReset = jest.fn()
const mockEnv: Record<string, string | undefined> = {}

jest.mock('$app/env/private', () => ({
  get CRON_SECRET() {
    return mockEnv.CRON_SECRET
  },
}))
jest.mock('#lib/server/idleAccounts.js', () => ({
  resetIdleVerification: (...args: any[]) => mockReset(...args),
}))
jest.mock('#lib/server/firebase.js', () => ({ adminAuth: {} }))

import { GET } from '../src/routes/api/cron/resetIdleVerification/+server'

const summary = {
  scanned: 3,
  idle: 1,
  reset: 1,
  failed: 0,
  deferred: 0,
  dryRun: false,
}

function call(authorization: string | null, query = '') {
  return GET({
    request: { headers: { get: () => authorization } },
    url: new URL(`http://localhost/api/cron/x${query}`),
  } as any)
}

describe('GET /api/cron/resetIdleVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockEnv.CRON_SECRET = 's3cret'
    mockReset.mockResolvedValue(summary)
  })

  test('runs the reset for the cron secret and returns its summary', async () => {
    const res: any = await call('Bearer s3cret')
    expect(mockReset).toHaveBeenCalledWith({ dryRun: false })
    expect(res).toBeInstanceOf(Response)
  })

  test('passes ?dryRun=1 through', async () => {
    await call('Bearer s3cret', '?dryRun=1')
    expect(mockReset).toHaveBeenCalledWith({ dryRun: true })
  })

  test.each([
    ['no header', null],
    ['a wrong secret', 'Bearer nope'],
    ['a different length', 'Bearer s3cret-and-more'],
    ['the secret without Bearer', 's3cret'],
  ])('refuses %s with a 401, resetting nobody', async (_label, header) => {
    await expect(call(header)).rejects.toMatchObject({ status: 401 })
    expect(mockReset).not.toHaveBeenCalled()
  })

  test.each([undefined, ''])(
    'refuses everyone, even a matching header, when CRON_SECRET is %p',
    async (value) => {
      mockEnv.CRON_SECRET = value
      await expect(call('Bearer ')).rejects.toMatchObject({ status: 500 })
      await expect(call('Bearer undefined')).rejects.toMatchObject({
        status: 500,
      })
      expect(mockReset).not.toHaveBeenCalled()
    },
  )
})
